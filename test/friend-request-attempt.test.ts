import { describe, expect, it, vi } from "vitest";
import {
  ApiTransportError,
  createFriendRequestAttemptCoordinator,
} from "@peekpoke/shared";

const FIRST_TARGET = "11111111-1111-4111-8111-111111111111";
const SECOND_TARGET = "22222222-2222-4222-8222-222222222222";

describe("friend request attempt coordinator", () => {
  it("retains an attempt only while the mutation outcome is unknown", async () => {
    const keys = ["friend-attempt-key-000001", "friend-attempt-key-000002"];
    const coordinator = createFriendRequestAttemptCoordinator(() => keys.shift()!);
    const firstAttempt = coordinator.run(FIRST_TARGET, async () => {
      throw new ApiTransportError("offline", 0, "NETWORK_UNAVAILABLE");
    });
    await expect(firstAttempt).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
    const retained = coordinator.peek(FIRST_TARGET);
    expect(retained).toMatchObject({
      key: "friend-attempt-key-000001",
      body: { addressee_id: FIRST_TARGET },
    });

    await expect(coordinator.run(FIRST_TARGET, async (attempt) => attempt.key))
      .resolves.toBe("friend-attempt-key-000001");
    expect(coordinator.peek(FIRST_TARGET)).toBeNull();

    await expect(coordinator.run(FIRST_TARGET, async () => {
      throw new ApiTransportError("conflict", 409, "ALREADY_PENDING");
    })).rejects.toMatchObject({ status: 409 });
    expect(coordinator.peek(FIRST_TARGET)).toBeNull();
  });

  it("retains repeated ambiguous RPC 503s but abandons a deterministic 503", async () => {
    const keys = ["friend-attempt-key-000011", "friend-attempt-key-000012"];
    const coordinator = createFriendRequestAttemptCoordinator(() => keys.shift()!);
    const ambiguous = () => coordinator.run(FIRST_TARGET, async () => {
      throw new ApiTransportError(
        "temporarily unavailable",
        503,
        "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
      );
    });

    await expect(ambiguous()).rejects.toMatchObject({ status: 503 });
    const retainedKey = coordinator.peek(FIRST_TARGET)?.key;
    await expect(ambiguous()).rejects.toMatchObject({ status: 503 });
    expect(coordinator.peek(FIRST_TARGET)?.key).toBe(retainedKey);

    await expect(coordinator.run(FIRST_TARGET, async () => {
      throw new ApiTransportError("rate limiter unavailable", 503, "RATE_LIMIT_UNAVAILABLE");
    })).rejects.toMatchObject({ code: "RATE_LIMIT_UNAVAILABLE" });
    expect(coordinator.peek(FIRST_TARGET)).toBeNull();
  });

  it("clears on success or cancel and assigns a distinct key when the target changes", async () => {
    let counter = 0;
    const coordinator = createFriendRequestAttemptCoordinator(
      () => `friend-attempt-key-${String(++counter).padStart(6, "0")}`,
    );

    await expect(coordinator.run(FIRST_TARGET, async (attempt) => attempt.key))
      .resolves.toBe("friend-attempt-key-000001");
    expect(coordinator.peek(FIRST_TARGET)).toBeNull();

    await expect(coordinator.run(FIRST_TARGET, async () => {
      throw new ApiTransportError("offline", 0, "NETWORK_UNAVAILABLE");
    })).rejects.toMatchObject({ status: 0 });
    expect(coordinator.cancel(FIRST_TARGET)).toBe(true);
    expect(coordinator.peek(FIRST_TARGET)).toBeNull();

    await expect(coordinator.run(SECOND_TARGET, async (attempt) => attempt.key))
      .resolves.toBe("friend-attempt-key-000003");
  });

  it("isolates targets and invokes the first concurrent commit once", async () => {
    let counter = 0;
    const coordinator = createFriendRequestAttemptCoordinator(
      () => `friend-attempt-key-${String(++counter).padStart(6, "0")}`,
    );
    let resolve!: (value: string) => void;
    const deliver = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const firstCommit = vi.fn();
    const duplicateCommit = vi.fn();

    const first = coordinator.run(FIRST_TARGET, deliver, firstCommit);
    const duplicate = coordinator.run(FIRST_TARGET, deliver, duplicateCommit);
    expect(duplicate).toBe(first);
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    expect(coordinator.peek(SECOND_TARGET)).toBeNull();
    expect(coordinator.run(SECOND_TARGET, async (attempt) => attempt.key))
      .resolves.toBe("friend-attempt-key-000002");
    resolve("ok");

    await expect(Promise.all([first, duplicate])).resolves.toEqual(["ok", "ok"]);
    expect(firstCommit).toHaveBeenCalledTimes(1);
    expect(duplicateCommit).not.toHaveBeenCalled();
  });
});
