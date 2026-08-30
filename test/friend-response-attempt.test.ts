import { describe, expect, it, vi } from "vitest";
import {
  ApiTransportError,
  createFriendResponseAttemptCoordinator,
} from "@peekpoke/shared";

const FRIENDSHIP_ID = "11111111-1111-4111-8111-111111111111";

describe("friend response attempt coordinator", () => {
  it("retains the exact key and body through an ambiguous response loss", async () => {
    const coordinator = createFriendResponseAttemptCoordinator(
      () => "friend-response-key-000001",
    );

    await expect(coordinator.run(FRIENDSHIP_ID, "accepted", async () => {
      throw new ApiTransportError("offline", 0, "NETWORK_UNAVAILABLE");
    })).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });

    expect(coordinator.peek(FRIENDSHIP_ID)).toMatchObject({
      key: "friend-response-key-000001",
      friendshipId: FRIENDSHIP_ID,
      status: "accepted",
      body: { status: "accepted" },
      serializedBody: JSON.stringify({ status: "accepted" }),
    });
    await expect(coordinator.run(
      FRIENDSHIP_ID,
      "accepted",
      async (attempt) => attempt.key,
    )).resolves.toBe("friend-response-key-000001");
    expect(coordinator.peek(FRIENDSHIP_ID)).toBeNull();
  });

  it("coalesces concurrent same-action delivery and commits only for the owner", async () => {
    const coordinator = createFriendResponseAttemptCoordinator(
      () => "friend-response-key-000002",
    );
    let resolve!: (value: string) => void;
    const deliver = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const ownerCommit = vi.fn();
    const duplicateCommit = vi.fn();

    const first = coordinator.run(FRIENDSHIP_ID, "declined", deliver, ownerCommit);
    const duplicate = coordinator.run(FRIENDSHIP_ID, "declined", deliver, duplicateCommit);
    expect(duplicate).toBe(first);
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    resolve("ok");

    await expect(Promise.all([first, duplicate])).resolves.toEqual(["ok", "ok"]);
    expect(ownerCommit).toHaveBeenCalledTimes(1);
    expect(duplicateCommit).not.toHaveBeenCalled();
  });

  it("blocks an action change while the previous outcome is uncertain", async () => {
    const deliver = vi.fn();
    const coordinator = createFriendResponseAttemptCoordinator(
      () => "friend-response-key-000003",
    );
    await expect(coordinator.run(FRIENDSHIP_ID, "accepted", async () => {
      throw new ApiTransportError(
        "temporarily unavailable",
        503,
        "FRIEND_RESPONSE_IDEMPOTENCY_UNAVAILABLE",
      );
    })).rejects.toMatchObject({ status: 503 });

    await expect(coordinator.run(FRIENDSHIP_ID, "declined", deliver))
      .rejects.toMatchObject({ status: 409, code: "FRIEND_RESPONSE_ATTEMPT_PENDING" });
    expect(deliver).not.toHaveBeenCalled();
    expect(coordinator.cancel(FRIENDSHIP_ID)).toBe(false);
    expect(coordinator.peek(FRIENDSHIP_ID)?.status).toBe("accepted");
  });

  it("abandons a deterministic failure and creates a new key when the action changes", async () => {
    const keys = ["friend-response-key-000004", "friend-response-key-000005"];
    const coordinator = createFriendResponseAttemptCoordinator(() => keys.shift()!);

    await expect(coordinator.run(FRIENDSHIP_ID, "accepted", async () => {
      throw new ApiTransportError("already responded", 409, "FRIEND_REQUEST_ALREADY_RESPONDED");
    })).rejects.toMatchObject({ status: 409 });
    expect(coordinator.peek(FRIENDSHIP_ID)).toBeNull();

    await expect(coordinator.run(
      FRIENDSHIP_ID,
      "declined",
      async (attempt) => attempt.key,
    )).resolves.toBe("friend-response-key-000005");
  });

  it("does not invoke a stale commit after the authenticated owner is reset", async () => {
    const coordinator = createFriendResponseAttemptCoordinator(
      () => "friend-response-key-000006",
    );
    let resolve!: (value: string) => void;
    const commit = vi.fn();
    const pending = coordinator.run(
      FRIENDSHIP_ID,
      "accepted",
      () => new Promise<string>((done) => { resolve = done; }),
      commit,
    );
    await vi.waitFor(() => expect(coordinator.peek(FRIENDSHIP_ID)).not.toBeNull());

    coordinator.reset();
    resolve("ok");

    await expect(pending).resolves.toBe("ok");
    expect(commit).not.toHaveBeenCalled();
    expect(coordinator.peek(FRIENDSHIP_ID)).toBeNull();
  });
});
