import { describe, expect, it, vi } from "vitest";
import { ApiTransportError, createBlockUserAttemptCoordinator } from "@peekpoke/shared";

const TARGET_ID = "22222222-2222-4222-8222-222222222222";

describe("block user attempt coordinator", () => {
  it.each([
    [0, "NETWORK_UNAVAILABLE"],
    [502, "INVALID_RESPONSE"],
    [503, "BLOCK_IDEMPOTENCY_UNAVAILABLE"],
  ])("retains the exact key for ambiguous status/code %#", async (status, code) => {
    const coordinator = createBlockUserAttemptCoordinator(() => "block-attempt-key-000001");

    await expect(coordinator.run(TARGET_ID, async () => {
      throw new ApiTransportError("ambiguous", status, code);
    })).rejects.toMatchObject({ code });

    expect(coordinator.peek(TARGET_ID)?.key).toBe("block-attempt-key-000001");
    await expect(coordinator.run(TARGET_ID, async (attempt) => attempt.key))
      .resolves.toBe("block-attempt-key-000001");
  });

  it("coalesces same-target delivery and crosses the commit barrier once", async () => {
    const coordinator = createBlockUserAttemptCoordinator(() => "block-attempt-key-000002");
    let resolve!: (value: string) => void;
    const deliver = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const ownerCommit = vi.fn();
    const duplicateCommit = vi.fn();

    const first = coordinator.run(TARGET_ID, deliver, ownerCommit);
    const duplicate = coordinator.run(TARGET_ID, deliver, duplicateCommit);
    expect(duplicate).toBe(first);
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    resolve("blocked");

    await expect(Promise.all([first, duplicate])).resolves.toEqual(["blocked", "blocked"]);
    expect(ownerCommit).toHaveBeenCalledOnce();
    expect(duplicateCommit).not.toHaveBeenCalled();
  });

  it("keeps different target owners and keys isolated", async () => {
    const keys = ["block-attempt-target-key-001", "block-attempt-target-key-002"];
    const coordinator = createBlockUserAttemptCoordinator(() => keys.shift()!);
    const otherTarget = "33333333-3333-4333-8333-333333333333";

    const results = await Promise.all([
      coordinator.run(TARGET_ID, async (attempt) => attempt),
      coordinator.run(otherTarget, async (attempt) => attempt),
    ]);

    expect(results).toEqual([
      { key: "block-attempt-target-key-001", targetUserId: TARGET_ID },
      { key: "block-attempt-target-key-002", targetUserId: otherTarget },
    ]);
  });

  it("drops deterministic rate failures and permits an explicit ambiguous discard", async () => {
    const keys = ["block-attempt-key-000003", "block-attempt-key-000004"];
    const coordinator = createBlockUserAttemptCoordinator(() => keys.shift()!);

    await expect(coordinator.run(TARGET_ID, async () => {
      throw new ApiTransportError("limited", 429, "RATE_LIMITED");
    })).rejects.toMatchObject({ status: 429 });
    expect(coordinator.peek(TARGET_ID)).toBeNull();

    await expect(coordinator.run(TARGET_ID, async () => {
      throw new ApiTransportError("unknown", 503, "BLOCK_IDEMPOTENCY_UNAVAILABLE");
    })).rejects.toMatchObject({ status: 503 });
    expect(coordinator.discard(TARGET_ID)).toBe(true);
    expect(coordinator.peek(TARGET_ID)).toBeNull();
  });

  it("suppresses a stale owner commit after authenticated-owner reset", async () => {
    const coordinator = createBlockUserAttemptCoordinator(() => "block-attempt-key-000005");
    let resolve!: (value: string) => void;
    const commit = vi.fn();
    const pending = coordinator.run(
      TARGET_ID,
      () => new Promise<string>((done) => { resolve = done; }),
      commit,
    );
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    coordinator.reset();
    resolve("blocked");

    await expect(pending).resolves.toBe("blocked");
    expect(commit).not.toHaveBeenCalled();
  });
});
