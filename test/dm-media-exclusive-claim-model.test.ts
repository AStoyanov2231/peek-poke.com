import { describe, expect, it } from "vitest";

type SendResult =
  | { status: "sent" | "replayed"; messageId: string }
  | { status: "conflict" };

class Mutex {
  private tail = Promise.resolve();

  async run<Result>(operation: () => Promise<Result>): Promise<Result> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

class ExclusiveMediaClaimModel {
  private readonly pairLock = new Mutex();
  private readonly generations = new Map<string, { messageId: string; fenced: boolean }>();
  private readonly messages = new Map<string, { messageId: string; paths: readonly string[] }>();
  private readonly claims = new Map<string, readonly string[]>();
  private nextMessage = 1;

  send(clientId: string, paths: readonly string[], failBeforeCommit = false): Promise<SendResult> {
    const canonicalPaths = [...paths].sort();
    return this.pairLock.run(async () => {
      const replay = this.messages.get(clientId);
      if (replay) {
        return replay.paths.join("\u001f") === canonicalPaths.join("\u001f")
          ? { status: "replayed", messageId: replay.messageId }
          : { status: "conflict" };
      }
      if (canonicalPaths.some((path) => this.generations.has(path))) {
        return { status: "conflict" };
      }

      const messageId = `message-${this.nextMessage++}`;
      if (failBeforeCommit) throw new Error("transaction aborted");
      this.messages.set(clientId, { messageId, paths: canonicalPaths });
      this.claims.set(messageId, canonicalPaths);
      for (const path of canonicalPaths) {
        this.generations.set(path, { messageId, fenced: false });
      }
      return { status: "sent", messageId };
    });
  }

  fence(messageId: string) {
    const paths = this.claims.get(messageId);
    if (!paths) throw new Error("claim unavailable");
    for (const path of paths) {
      const generation = this.generations.get(path);
      if (!generation || generation.messageId !== messageId) throw new Error("split claim");
      generation.fenced = true;
    }
  }

  evidence() {
    return {
      messages: this.messages.size,
      claims: this.claims.size,
      generations: [...this.generations.values()],
    };
  }
}

const PAIR = ["actor/stem.jpg", "actor/stem_thumb.webp"] as const;

describe("exclusive DM media claim transaction model", () => {
  it("serializes simultaneous A/B sends to one complete pair owner", async () => {
    const model = new ExclusiveMediaClaimModel();
    const [a, b] = await Promise.all([
      model.send("client-a", PAIR),
      model.send("client-b", PAIR),
    ]);

    expect([a.status, b.status].sort()).toEqual(["conflict", "sent"]);
    const winner = a.status === "sent" ? a : b;
    expect(model.evidence()).toEqual({
      messages: 1,
      claims: 1,
      generations: [
        { messageId: winner.messageId, fenced: false },
        { messageId: winner.messageId, fenced: false },
      ],
    });
  });

  it("converges simultaneous same-key delivery on the same message", async () => {
    const model = new ExclusiveMediaClaimModel();
    const [first, replay] = await Promise.all([
      model.send("same-client", PAIR),
      model.send("same-client", PAIR),
    ]);

    expect(first.status).toBe("sent");
    expect(replay).toEqual({ status: "replayed", messageId: first.messageId });
    expect(model.evidence()).toMatchObject({ messages: 1, claims: 1 });
  });

  it("leaves no orphan after abort and keeps a fenced pair unavailable", async () => {
    const model = new ExclusiveMediaClaimModel();
    await expect(model.send("failed-client", PAIR, true)).rejects.toThrow("transaction aborted");
    expect(model.evidence()).toEqual({ messages: 0, claims: 0, generations: [] });

    const sent = await model.send("client-a", PAIR);
    if (sent.status !== "sent") throw new Error("fixture send failed");
    model.fence(sent.messageId);
    await expect(model.send("client-b", PAIR)).resolves.toEqual({ status: "conflict" });
    expect(model.evidence().generations).toEqual([
      { messageId: sent.messageId, fenced: true },
      { messageId: sent.messageId, fenced: true },
    ]);
  });
});
