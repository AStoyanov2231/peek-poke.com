import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blockUser,
  cancelFriendRequestAttempt,
  discardBlockUser,
  discardFriendshipRemoval,
  removeFriendship,
  resetFriendMutationAttempts,
  respondToFriendRequest,
  sendFriendRequest,
} from "@/data/friend-mutations";

const friendship = {
  id: "33333333-3333-4333-8333-333333333333",
  requester_id: "11111111-1111-4111-8111-111111111111",
  addressee_id: "22222222-2222-4222-8222-222222222222",
  status: "pending" as const,
  requested_at: "2026-08-07T10:00:00.000Z",
  responded_at: null,
};

afterEach(() => {
  cancelFriendRequestAttempt(friendship.addressee_id);
  resetFriendMutationAttempts();
  vi.unstubAllGlobals();
});

describe("web friendship mutation transport", () => {
  it("validates creation before committing cache state and sends idempotency", async () => {
    const commit = vi.fn();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      friendship: { ...friendship, private_column: "raw row leak" },
      balance: 4,
    })));
    vi.stubGlobal("crypto", { randomUUID: () => "web-friend-key-000001" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendFriendRequest(friendship.addressee_id, commit)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    expect(commit).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/friends", expect.objectContaining({
      headers: expect.objectContaining({ "idempotency-key": "web-friend-key-000001" }),
    }));
  });

  it("reuses the exact key and body after response loss", async () => {
    const payload = { friendship, balance: 4 };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    vi.stubGlobal("crypto", { randomUUID: () => "web-friend-key-retry-00001" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendFriendRequest(friendship.addressee_id)).rejects.toMatchObject({
      code: "NETWORK_UNAVAILABLE",
    });
    await expect(sendFriendRequest(friendship.addressee_id)).resolves.toEqual(payload);

    const first = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const second = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(first.body).toBe(JSON.stringify({ addressee_id: friendship.addressee_id }));
    expect(second.body).toBe(first.body);
    expect(new Headers(first.headers).get("idempotency-key")).toBe("web-friend-key-retry-00001");
    expect(new Headers(second.headers).get("idempotency-key")).toBe(
      new Headers(first.headers).get("idempotency-key"),
    );
  });

  it("retains repeated ambiguous 503s, replays success, and commits once", async () => {
    const payload = { friendship, balance: 4 };
    const createKey = vi.fn()
      .mockReturnValueOnce("web-friend-key-ambiguous-001")
      .mockReturnValueOnce("web-friend-key-after-success-01");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(errorResponse(
        503,
        "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
        "Friend request service temporarily unavailable",
      ))
      .mockResolvedValueOnce(errorResponse(
        503,
        "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
        "Friend request service temporarily unavailable",
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    const commit = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: createKey });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendFriendRequest(friendship.addressee_id, commit)).rejects.toMatchObject({
      status: 503,
      code: "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
    });
    await expect(sendFriendRequest(friendship.addressee_id, commit)).rejects.toMatchObject({
      status: 503,
      code: "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
    });
    await expect(sendFriendRequest(friendship.addressee_id, commit)).resolves.toEqual(payload);

    const attempts = fetchMock.mock.calls.slice(0, 3).map((call) => call[1] as RequestInit);
    expect(attempts.map((attempt) => new Headers(attempt.headers).get("idempotency-key")))
      .toEqual(Array(3).fill("web-friend-key-ambiguous-001"));
    expect(attempts.map((attempt) => attempt.body))
      .toEqual(Array(3).fill(JSON.stringify({ addressee_id: friendship.addressee_id })));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(createKey).toHaveBeenCalledTimes(1);

    await expect(sendFriendRequest(friendship.addressee_id)).resolves.toEqual(payload);
    expect(new Headers((fetchMock.mock.calls[3]?.[1] as RequestInit).headers).get("idempotency-key"))
      .toBe("web-friend-key-after-success-01");
  });

  it("abandons a 409 hash conflict and uses a fresh key for the next attempt", async () => {
    const payload = { friendship, balance: 4 };
    const createKey = vi.fn()
      .mockReturnValueOnce("web-friend-key-conflict-0001")
      .mockReturnValueOnce("web-friend-key-conflict-0002");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(errorResponse(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "Idempotency key was already used for a different request",
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    vi.stubGlobal("crypto", { randomUUID: createKey });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendFriendRequest(friendship.addressee_id)).rejects.toMatchObject({
      status: 409,
      code: "IDEMPOTENCY_KEY_REUSED",
    });
    await expect(sendFriendRequest(friendship.addressee_id)).resolves.toEqual(payload);

    const keys = fetchMock.mock.calls.map((call) =>
      new Headers((call[1] as RequestInit).headers).get("idempotency-key"));
    expect(keys).toEqual(["web-friend-key-conflict-0001", "web-friend-key-conflict-0002"]);
  });

  it("coalesces concurrent presses and crosses the commit barrier once", async () => {
    const payload = { friendship, balance: 4 };
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    }));
    const firstCommit = vi.fn();
    const duplicateCommit = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: () => "web-friend-key-concurrent-01" });
    vi.stubGlobal("fetch", fetchMock);

    const first = sendFriendRequest(friendship.addressee_id, firstCommit);
    const duplicate = sendFriendRequest(friendship.addressee_id, duplicateCommit);
    expect(duplicate).toBe(first);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveResponse(new Response(JSON.stringify(payload)));

    await expect(Promise.all([first, duplicate])).resolves.toEqual([payload, payload]);
    expect(firstCommit).toHaveBeenCalledTimes(1);
    expect(duplicateCommit).not.toHaveBeenCalled();
  });

  it.each([
    ["response", { status: "accepted", friendship: { ...friendship, status: "accepted", raw: true } }],
    ["removal", { success: true, refunded: false }],
  ])("does not commit malformed %s success", async (kind, payload) => {
    const commit = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: () => "web-friend-key-000004" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));

    const mutation = kind === "response"
      ? respondToFriendRequest(friendship.id, "accepted")
      : removeFriendship(friendship.id);
    await expect(mutation.then(commit)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([
    ["accepted", { status: "accepted", friendship: { ...friendship, status: "accepted" } }],
    ["declined", { status: "declined", friendship: null }],
  ])("accepts the canonical %s response", async (_status, payload) => {
    vi.stubGlobal("crypto", { randomUUID: () => "web-friend-key-000002" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));

    await expect(respondToFriendRequest(friendship.id, payload.status as "accepted" | "declined"))
      .resolves.toEqual(payload);
  });

  it("retains the PATCH key/body after response loss and commits the replay once", async () => {
    const payload = {
      status: "accepted" as const,
      friendship: { ...friendship, status: "accepted" as const },
    };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    const commit = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: () => "web-response-key-retry-0001" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(respondToFriendRequest(friendship.id, "accepted", commit))
      .rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
    await expect(respondToFriendRequest(friendship.id, "accepted", commit))
      .resolves.toEqual(payload);

    const first = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const replay = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(first.body).toBe(JSON.stringify({ status: "accepted" }));
    expect(replay.body).toBe(first.body);
    expect(new Headers(first.headers).get("idempotency-key")).toBe(
      "web-response-key-retry-0001",
    );
    expect(new Headers(replay.headers).get("idempotency-key")).toBe(
      new Headers(first.headers).get("idempotency-key"),
    );
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("coalesces duplicate PATCH actions and keeps a conflicting action off the wire", async () => {
    const payload = { status: "declined" as const, friendship: null };
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    const ownerCommit = vi.fn();
    const duplicateCommit = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: () => "web-response-key-coalesce-01" });
    vi.stubGlobal("fetch", fetchMock);

    const first = respondToFriendRequest(friendship.id, "declined", ownerCommit);
    const duplicate = respondToFriendRequest(friendship.id, "declined", duplicateCommit);
    const conflict = respondToFriendRequest(friendship.id, "accepted");
    expect(duplicate).toBe(first);
    await expect(conflict).rejects.toMatchObject({
      code: "FRIEND_RESPONSE_ATTEMPT_PENDING",
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolve(new Response(JSON.stringify(payload)));

    await expect(Promise.all([first, duplicate])).resolves.toEqual([payload, payload]);
    expect(ownerCommit).toHaveBeenCalledTimes(1);
    expect(duplicateCommit).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not commit a web PATCH after the authenticated attempt owner resets", async () => {
    const payload = { status: "declined" as const, friendship: null };
    let resolve!: (response: Response) => void;
    const commit = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: () => "web-response-key-stale-0001" });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));

    const pending = respondToFriendRequest(friendship.id, "declined", commit);
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    resetFriendMutationAttempts();
    resolve(new Response(JSON.stringify(payload)));

    await expect(pending).resolves.toEqual(payload);
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([
    [{ success: true, refunded: true, balance: 5 }],
    [{ success: true, refunded: false, balance: null }],
  ])("accepts canonical removal/refund state %#", async (payload) => {
    vi.stubGlobal("crypto", { randomUUID: () => "web-friend-key-000003" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));

    await expect(removeFriendship(friendship.id)).resolves.toEqual(payload);
  });

  it("retries a lost DELETE response with the same key and commits once", async () => {
    const payload = { success: true as const, refunded: true, balance: 5 };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    const commit = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: () => "web-removal-key-retry-0001" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(removeFriendship(friendship.id, commit))
      .rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
    await expect(removeFriendship(friendship.id, commit)).resolves.toEqual(payload);

    const keys = fetchMock.mock.calls.map((call) =>
      new Headers((call[1] as RequestInit).headers).get("idempotency-key"));
    expect(keys).toEqual([
      "web-removal-key-retry-0001",
      "web-removal-key-retry-0001",
    ]);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("allows an explicit web discard after an ambiguous DELETE", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "web-removal-key-discard-01" });
    vi.stubGlobal("fetch", vi.fn(async () => errorResponse(
      503,
      "FRIENDSHIP_REMOVAL_IDEMPOTENCY_UNAVAILABLE",
      "Friend removal service temporarily unavailable",
    )));

    await expect(removeFriendship(friendship.id)).rejects.toMatchObject({ status: 503 });
    expect(discardFriendshipRemoval(friendship.id)).toBe(true);
  });

  it("does not commit a web DELETE after the authenticated attempt owner resets", async () => {
    const payload = { success: true as const, refunded: false, balance: null };
    let resolve!: (response: Response) => void;
    const commit = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: () => "web-removal-key-stale-0001" });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));

    const pending = removeFriendship(friendship.id, commit);
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    resetFriendMutationAttempts();
    resolve(new Response(JSON.stringify(payload)));

    await expect(pending).resolves.toEqual(payload);
    expect(commit).not.toHaveBeenCalled();
  });

  it("retries a lost block response with the same key and commits refund state once", async () => {
    const payload = { success: true as const, refunded: true as const, balance: 5 };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    const commit = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: () => "web-block-key-retry-000001" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(blockUser(friendship.addressee_id, commit))
      .rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
    await expect(blockUser(friendship.addressee_id, commit)).resolves.toEqual(payload);

    expect(fetchMock.mock.calls.map((call) =>
      new Headers((call[1] as RequestInit).headers).get("idempotency-key")))
      .toEqual(["web-block-key-retry-000001", "web-block-key-retry-000001"]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/users/${friendship.addressee_id}/block`);
    expect(commit).toHaveBeenCalledOnce();
  });

  it("permits explicit discard after an ambiguous block response", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "web-block-key-discard-0001" });
    vi.stubGlobal("fetch", vi.fn(async () => errorResponse(
      503,
      "BLOCK_IDEMPOTENCY_UNAVAILABLE",
      "Block service temporarily unavailable",
    )));

    await expect(blockUser(friendship.addressee_id)).rejects.toMatchObject({ status: 503 });
    expect(discardBlockUser(friendship.addressee_id)).toBe(true);
  });

  it("does not commit a block response after the authenticated owner resets", async () => {
    const payload = { success: true as const, refunded: false as const, balance: null };
    let resolve!: (response: Response) => void;
    const commit = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: () => "web-block-key-stale-000001" });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));

    const pending = blockUser(friendship.addressee_id, commit);
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    resetFriendMutationAttempts();
    resolve(new Response(JSON.stringify(payload)));

    await expect(pending).resolves.toEqual(payload);
    expect(commit).not.toHaveBeenCalled();
  });
});

function errorResponse(status: number, code: string, message: string) {
  return new Response(JSON.stringify({
    version: "v1",
    error: message,
    message,
    code,
    request_id: "friend-request-transport-test",
  }), { status });
}
