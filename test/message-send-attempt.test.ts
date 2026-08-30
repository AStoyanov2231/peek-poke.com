import { describe, expect, it, vi } from "vitest";
import {
  createChatMessageAttemptCoordinator,
  createChatMessageUiLifecycle,
  type ChatMessageAttempt,
} from "@peekpoke/shared";

const FIRST_CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const THIRD_CLIENT_ID = "33333333-3333-4333-8333-333333333333";
const REPLY_ID = "44444444-4444-4444-8444-444444444444";

function createIds() {
  const ids = [FIRST_CLIENT_ID, SECOND_CLIENT_ID, THIRD_CLIENT_ID];
  return vi.fn(() => ids.shift()!);
}

describe("chat message send attempts", () => {
  it("reuses the exact body and header after a commit response is lost", async () => {
    const attempts = createChatMessageAttemptCoordinator(createIds());
    const requests: Array<{ body: string; idempotencyKey: string }> = [];
    const committed = new Map<string, { id: string }>();
    let loseResponse = true;
    const deliver = async (attempt: ChatMessageAttempt) => {
      requests.push({
        body: JSON.stringify(attempt.payload),
        idempotencyKey: attempt.clientId,
      });
      const message = committed.get(attempt.clientId) ?? { id: "logical-message-1" };
      committed.set(attempt.clientId, message);
      if (loseResponse) {
        loseResponse = false;
        throw new TypeError("response connection lost after commit");
      }
      return message;
    };
    const draft = { content: "  Hello  ", replyToId: REPLY_ID };

    await expect(attempts.run(draft, deliver)).rejects.toThrow("response connection lost");
    await expect(attempts.run(draft, deliver)).resolves.toEqual({ id: "logical-message-1" });

    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[0].idempotencyKey).toBe(FIRST_CLIENT_ID);
    expect(JSON.parse(requests[0].body)).toEqual({
      client_id: FIRST_CLIENT_ID,
      content: "Hello",
      reply_to_id: REPLY_ID,
    });
    expect(committed).toHaveLength(1);
    expect(attempts.peek()).toBeNull();
  });

  it("retains a validated media payload after failure without rerunning upload work", async () => {
    const attempts = createChatMessageAttemptCoordinator(createIds());
    const upload = vi.fn(async () => ({
      url: "https://project.supabase.co/storage/v1/object/sign/media/user/photo.jpg?token=main",
      thumbnailUrl: "https://project.supabase.co/storage/v1/object/sign/media/user/photo_thumb.webp?token=thumb",
    }));
    const media = await upload();
    const draft = {
      content: "Photo",
      mediaUrl: media.url,
      mediaThumbnailUrl: media.thumbnailUrl,
    };
    const bodies: string[] = [];
    const deliver = vi.fn(async (attempt: ChatMessageAttempt) => {
      bodies.push(JSON.stringify(attempt.payload));
      if (bodies.length === 1) throw new TypeError("lost response");
      return { id: "logical-image-1" };
    });

    await expect(attempts.run(draft, deliver)).rejects.toThrow("lost response");
    await expect(attempts.run(attempts.peek()!.draft, deliver)).resolves.toEqual({
      id: "logical-image-1",
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(bodies[1]).toBe(bodies[0]);
  });

  it("abandons the old key when text or media changes", async () => {
    const attempts = createChatMessageAttemptCoordinator(createIds());
    const fail = async () => {
      throw new Error("offline");
    };

    await expect(attempts.run({ content: "first" }, fail)).rejects.toThrow("offline");
    expect(attempts.prepare({ content: "second" }).clientId).toBe(SECOND_CLIENT_ID);
    expect(attempts.prepare({
      content: "Photo",
      mediaUrl: "https://project.supabase.co/storage/v1/object/sign/media/user/new.jpg?token=new",
    }).clientId).toBe(THIRD_CLIENT_ID);
    expect(() => attempts.matches({ content: "x".repeat(4001) })).not.toThrow();
    expect(attempts.matches({ content: "x".repeat(4001) })).toBe(false);
  });

  it("clears on success or explicit cancellation", async () => {
    const attempts = createChatMessageAttemptCoordinator(createIds());

    await expect(attempts.run({ content: "sent" }, async () => "ok")).resolves.toBe("ok");
    expect(attempts.peek()).toBeNull();

    attempts.prepare({ content: "not sent" });
    expect(attempts.cancel()).toBe(true);
    expect(attempts.peek()).toBeNull();
  });

  it("coalesces concurrent presses into one delivery promise", async () => {
    const attempts = createChatMessageAttemptCoordinator(createIds());
    let resolveDelivery!: (value: string) => void;
    const deliver = vi.fn(() => new Promise<string>((resolve) => {
      resolveDelivery = resolve;
    }));
    const draft = { content: "one press" };

    const first = attempts.run(draft, deliver);
    const second = attempts.run(draft, deliver);

    expect(second).toBe(first);
    await Promise.resolve();
    expect(deliver).toHaveBeenCalledTimes(1);
    resolveDelivery("sent");
    await expect(first).resolves.toBe("sent");
    await expect(second).resolves.toBe("sent");
  });

  it("forgets retained signed media immediately on account or screen reset", async () => {
    const attempts = createChatMessageAttemptCoordinator(createIds());
    let rejectDelivery!: (error: Error) => void;
    const pendingDelivery = attempts.run({
      content: "Photo",
      mediaUrl: "https://project.supabase.co/storage/v1/object/sign/media/user/private.jpg?token=secret",
    }, () => new Promise((_resolve, reject) => {
      rejectDelivery = reject;
    }));
    await Promise.resolve();

    attempts.reset();
    expect(attempts.peek()).toBeNull();
    rejectDelivery(new Error("signed out"));
    await expect(pendingDelivery).rejects.toThrow("signed out");
    expect(attempts.peek()).toBeNull();
  });

  it("commits same-tick submits once, then allows retry and distinct attempts", async () => {
    const attempts = createChatMessageAttemptCoordinator(createIds());
    const lifecycle = createChatMessageUiLifecycle();
    const counters = {
      deliveries: 0,
      successes: 0,
      errorToasts: 0,
      messageInvalidations: 0,
      inboxInvalidations: 0,
      threadInvalidations: 0,
      inputClears: 0,
      mediaClears: 0,
    };
    let failDelivery = false;
    let releaseDelivery!: () => void;

    async function submit(content: string) {
      const token = lifecycle.begin();
      if (!token) return "coalesced";
      const draft = { content };
      const attempt = attempts.prepare(draft);
      try {
        const result = await attempts.run(draft, async () => {
          counters.deliveries += 1;
          await new Promise<void>((resolve) => {
            releaseDelivery = resolve;
          });
          if (failDelivery) throw new Error("lost response");
          return "sent";
        });
        lifecycle.commitOnce(token, attempt.clientId, () => {
          counters.successes += 1;
          counters.messageInvalidations += 1;
          counters.inboxInvalidations += 1;
          counters.threadInvalidations += 1;
          counters.inputClears += 1;
          counters.mediaClears += 1;
        });
        return result;
      } catch (error) {
        counters.errorToasts += 1;
        throw error;
      } finally {
        lifecycle.end(token);
      }
    }

    const first = submit("same tick");
    const duplicate = submit("same tick");
    await Promise.resolve();
    releaseDelivery();
    await expect(first).resolves.toBe("sent");
    await expect(duplicate).resolves.toBe("coalesced");
    expect(counters).toEqual({
      deliveries: 1,
      successes: 1,
      errorToasts: 0,
      messageInvalidations: 1,
      inboxInvalidations: 1,
      threadInvalidations: 1,
      inputClears: 1,
      mediaClears: 1,
    });
    const duplicateToken = lifecycle.begin()!;
    lifecycle.commitOnce(duplicateToken, FIRST_CLIENT_ID, () => {
      counters.successes += 1;
      counters.messageInvalidations += 1;
      counters.inboxInvalidations += 1;
      counters.threadInvalidations += 1;
      counters.inputClears += 1;
      counters.mediaClears += 1;
    });
    lifecycle.end(duplicateToken);
    expect(counters.successes).toBe(1);
    expect(counters.threadInvalidations).toBe(1);

    failDelivery = true;
    const failed = submit("retry me");
    await Promise.resolve();
    releaseDelivery();
    await expect(failed).rejects.toThrow("lost response");
    const failedClientId = attempts.peek()?.clientId;
    failDelivery = false;
    const retried = submit("retry me");
    await Promise.resolve();
    expect(attempts.peek()?.clientId).toBe(failedClientId);
    releaseDelivery();
    await expect(retried).resolves.toBe("sent");

    const distinct = submit("distinct");
    await Promise.resolve();
    releaseDelivery();
    await expect(distinct).resolves.toBe("sent");
    expect(counters).toEqual({
      deliveries: 4,
      successes: 3,
      errorToasts: 1,
      messageInvalidations: 3,
      inboxInvalidations: 3,
      threadInvalidations: 3,
      inputClears: 3,
      mediaClears: 3,
    });
  });

  it("ignores a stale success callback after account or thread reset", () => {
    const lifecycle = createChatMessageUiLifecycle();
    const oldToken = lifecycle.begin()!;
    const threadBUi = {
      cacheCommits: 0,
      errorToasts: 0,
      draft: "Thread B draft",
      pendingMedia: true,
      sending: true,
    };

    lifecycle.reset();
    lifecycle.commitOnce(oldToken, FIRST_CLIENT_ID, () => {
      threadBUi.cacheCommits += 1;
      threadBUi.draft = "";
      threadBUi.pendingMedia = false;
    });
    lifecycle.commitOnce(oldToken, oldToken.nonce, () => {
      threadBUi.errorToasts += 1;
    });
    lifecycle.runIfCurrent(oldToken, () => {
      threadBUi.sending = false;
    });
    const currentToken = lifecycle.begin()!;
    lifecycle.commitOnce(currentToken, SECOND_CLIENT_ID, () => {
      threadBUi.cacheCommits += 1;
    });

    expect(threadBUi).toEqual({
      cacheCommits: 1,
      errorToasts: 0,
      draft: "Thread B draft",
      pendingMedia: true,
      sending: true,
    });
    expect(lifecycle.isGenerationCurrent(oldToken)).toBe(false);
    expect(lifecycle.isCurrent(currentToken)).toBe(true);
  });

  it("commits duplicate web edit success once", () => {
    const lifecycle = createChatMessageUiLifecycle();
    const token = lifecycle.begin()!;
    const effects = { cacheUpdates: 0, inputClears: 0, invalidations: 0 };
    const commitEdit = () => lifecycle.commitOnce(token, token.nonce, () => {
      effects.cacheUpdates += 1;
      effects.inputClears += 1;
      effects.invalidations += 1;
    });

    commitEdit();
    commitEdit();

    expect(effects).toEqual({ cacheUpdates: 1, inputClears: 1, invalidations: 1 });
  });

  it("rejects late web callbacks as soon as the owner tears down without reset", () => {
    let currentOwner: string | null = "thread-a:user-a";
    const lifecycle = createChatMessageUiLifecycle(() => currentOwner);
    const threadAToken = lifecycle.begin()!;
    const effects = { cacheCommits: 0, errors: 0, settled: 0 };

    currentOwner = null;
    lifecycle.commitOnce(threadAToken, FIRST_CLIENT_ID, () => {
      effects.cacheCommits += 1;
    });
    lifecycle.commitOnce(threadAToken, threadAToken.nonce, () => {
      effects.errors += 1;
    });
    lifecycle.runIfCurrent(threadAToken, () => {
      effects.settled += 1;
    });

    currentOwner = "thread-b:user-a";
    const threadBToken = lifecycle.begin();
    expect(threadBToken).not.toBeNull();
    expect(effects).toEqual({ cacheCommits: 0, errors: 0, settled: 0 });
  });
});
