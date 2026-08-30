import { describe, expect, it, vi } from "vitest";
import {
  ApiTransportError,
  createFriendRemovalAttemptCoordinator,
} from "@peekpoke/shared";

const FRIENDSHIP_ID = "11111111-1111-4111-8111-111111111111";

describe("friend removal attempt coordinator", () => {
  it("retains the exact key after an ambiguous lost response", async () => {
    const coordinator = createFriendRemovalAttemptCoordinator(
      () => "friend-removal-key-000001",
    );

    await expect(coordinator.run(FRIENDSHIP_ID, async () => {
      throw new ApiTransportError("offline", 0, "NETWORK_UNAVAILABLE");
    })).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });

    expect(coordinator.peek(FRIENDSHIP_ID)).toEqual({
      key: "friend-removal-key-000001",
      friendshipId: FRIENDSHIP_ID,
    });
    await expect(coordinator.run(
      FRIENDSHIP_ID,
      async (attempt) => attempt.key,
    )).resolves.toBe("friend-removal-key-000001");
    expect(coordinator.peek(FRIENDSHIP_ID)).toBeNull();
  });

  it("coalesces duplicate delivery and invokes only the owning commit", async () => {
    const coordinator = createFriendRemovalAttemptCoordinator(
      () => "friend-removal-key-000002",
    );
    let resolve!: (value: string) => void;
    const deliver = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const ownerCommit = vi.fn();
    const duplicateCommit = vi.fn();

    const first = coordinator.run(FRIENDSHIP_ID, deliver, ownerCommit);
    const duplicate = coordinator.run(FRIENDSHIP_ID, deliver, duplicateCommit);
    expect(duplicate).toBe(first);
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    resolve("removed");

    await expect(Promise.all([first, duplicate])).resolves.toEqual(["removed", "removed"]);
    expect(ownerCommit).toHaveBeenCalledTimes(1);
    expect(duplicateCommit).not.toHaveBeenCalled();
  });

  it("allows an explicit discard only after delivery settles", async () => {
    const coordinator = createFriendRemovalAttemptCoordinator(
      () => "friend-removal-key-000003",
    );
    let reject!: (error: Error) => void;
    const pending = coordinator.run(
      FRIENDSHIP_ID,
      () => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }),
    );
    await vi.waitFor(() => expect(coordinator.peek(FRIENDSHIP_ID)).not.toBeNull());
    expect(coordinator.discard(FRIENDSHIP_ID)).toBe(false);
    reject(new ApiTransportError(
      "temporarily unavailable",
      503,
      "FRIENDSHIP_REMOVAL_IDEMPOTENCY_UNAVAILABLE",
    ));
    await expect(pending).rejects.toMatchObject({ status: 503 });

    expect(coordinator.discard(FRIENDSHIP_ID)).toBe(true);
    expect(coordinator.peek(FRIENDSHIP_ID)).toBeNull();
  });

  it("drops deterministic failures and suppresses a stale owner commit after reset", async () => {
    const keys = ["friend-removal-key-000004", "friend-removal-key-000005"];
    const coordinator = createFriendRemovalAttemptCoordinator(() => keys.shift()!);

    await expect(coordinator.run(FRIENDSHIP_ID, async () => {
      throw new ApiTransportError("not found", 404, "FRIENDSHIP_NOT_FOUND");
    })).rejects.toMatchObject({ status: 404 });
    expect(coordinator.peek(FRIENDSHIP_ID)).toBeNull();

    let resolve!: (value: string) => void;
    const commit = vi.fn();
    const pending = coordinator.run(
      FRIENDSHIP_ID,
      () => new Promise<string>((done) => { resolve = done; }),
      commit,
    );
    await vi.waitFor(() => expect(coordinator.peek(FRIENDSHIP_ID)).not.toBeNull());
    coordinator.reset();
    resolve("removed");

    await expect(pending).resolves.toBe("removed");
    expect(commit).not.toHaveBeenCalled();
  });
});
