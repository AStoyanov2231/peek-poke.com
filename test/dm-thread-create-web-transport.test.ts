import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrFindThread } from "@/data/thread-mutations";
import { dmThreadCreateResponseSchema } from "@peekpoke/shared";

const ID = "33333333-3333-4333-8333-333333333333";
const payload = {
  id: ID,
  is_new: true,
  balance: 4,
  thread: {
    id: ID,
    participant_1_id: "11111111-1111-4111-8111-111111111111",
    participant_2_id: "22222222-2222-4222-8222-222222222222",
    last_message_at: null,
    last_message_preview: null,
    created_at: "2026-08-07T10:00:00.000Z",
    unread_count: 0,
    participant_1: {
      id: "11111111-1111-4111-8111-111111111111",
      username: "viewer",
      display_name: "Viewer",
      avatar_url: null,
      location_text: null,
      is_online: true,
      last_seen_at: "2026-08-07T09:59:00.000Z",
    },
    participant_2: {
      id: "22222222-2222-4222-8222-222222222222",
      username: "peer",
      display_name: null,
      avatar_url: null,
      location_text: "Sofia",
      is_online: false,
      last_seen_at: null,
    },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("web DM thread-create transport", () => {
  it("shares one in-flight request and key for concurrent calls to the same target", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const randomUUID = vi.fn(() => "web-thread-key-concurrent-000001");
    vi.stubGlobal("crypto", { randomUUID });
    vi.stubGlobal("fetch", fetchMock);

    const first = createOrFindThread(payload.thread.participant_2_id);
    const second = createOrFindThread(payload.thread.participant_2_id);

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    resolveFetch(new Response(JSON.stringify(payload)));
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(secondResult).toBe(firstResult);
  });

  it("shares validation failure, then retries a later action with a fresh key", async () => {
    const malformed = { ...payload, balance: "4" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(malformed)))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    const randomUUID = vi.fn()
      .mockReturnValueOnce("web-thread-key-rejected-000001")
      .mockReturnValueOnce("web-thread-key-retry-000002");
    vi.stubGlobal("crypto", { randomUUID });
    vi.stubGlobal("fetch", fetchMock);
    const commit = vi.fn();

    const first = createOrFindThread(payload.thread.participant_2_id);
    const second = createOrFindThread(payload.thread.participant_2_id);
    expect(second).toBe(first);
    const [firstError, secondError] = await Promise.all([
      first.catch((error: unknown) => error),
      second.catch((error: unknown) => error),
    ]);
    expect(secondError).toBe(firstError);
    expect(firstError).toMatchObject({ code: "INVALID_RESPONSE" });
    expect(commit).not.toHaveBeenCalled();

    const retry = await createOrFindThread(payload.thread.participant_2_id);
    commit(retry);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(randomUUID).toHaveBeenCalledTimes(2);
    const retryHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(retryHeaders["idempotency-key"]).toBe("web-thread-key-retry-000002");
  });

  it("clears a successful action so a later action gets a fresh request and key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload)));
    const randomUUID = vi.fn()
      .mockReturnValueOnce("web-thread-key-success-000001")
      .mockReturnValueOnce("web-thread-key-success-000002");
    vi.stubGlobal("crypto", { randomUUID });
    vi.stubGlobal("fetch", fetchMock);

    await createOrFindThread(payload.thread.participant_2_id);
    await createOrFindThread(payload.thread.participant_2_id);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(randomUUID).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(firstHeaders["idempotency-key"]).toBe("web-thread-key-success-000001");
    expect(secondHeaders["idempotency-key"]).toBe("web-thread-key-success-000002");
  });

  it("does not coalesce concurrent calls for different targets", async () => {
    const otherTarget = "44444444-4444-4444-8444-444444444444";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...payload,
        thread: {
          ...payload.thread,
          participant_2_id: otherTarget,
          participant_2: { ...payload.thread.participant_2, id: otherTarget },
        },
      })));
    const randomUUID = vi.fn()
      .mockReturnValueOnce("web-thread-key-target-a-000001")
      .mockReturnValueOnce("web-thread-key-target-b-000002");
    vi.stubGlobal("crypto", { randomUUID });
    vi.stubGlobal("fetch", fetchMock);

    const first = createOrFindThread(payload.thread.participant_2_id);
    const second = createOrFindThread(otherTarget);

    expect(second).not.toBe(first);
    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it("rejects a schema-valid response for the wrong target before commit or navigation", async () => {
    const wrongTargetPayload = {
      ...payload,
      thread: {
        ...payload.thread,
        participant_1_id: "44444444-4444-4444-8444-444444444444",
        participant_2_id: "55555555-5555-4555-8555-555555555555",
        participant_1: {
          ...payload.thread.participant_1,
          id: "44444444-4444-4444-8444-444444444444",
        },
        participant_2: {
          ...payload.thread.participant_2,
          id: "55555555-5555-4555-8555-555555555555",
        },
      },
    };
    const commit = vi.fn();
    const navigate = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: () => "web-thread-key-wrong-target-000001" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(wrongTargetPayload))));

    expect(dmThreadCreateResponseSchema.parse(wrongTargetPayload)).toEqual(wrongTargetPayload);
    await expect(createOrFindThread(payload.thread.participant_2_id).then((result) => {
      commit(result);
      navigate(result.id);
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(commit).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("makes one idempotent request and validates before commit/navigation", async () => {
    const commit = vi.fn();
    const navigate = vi.fn();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload)));
    vi.stubGlobal("crypto", { randomUUID: () => "web-thread-key-000001" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createOrFindThread(payload.thread.participant_2_id);
    commit(result);
    navigate(result.id);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/dm/threads", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "idempotency-key": "web-thread-key-000001" }),
    }));
    expect(commit).toHaveBeenCalledWith(payload);
    expect(navigate).toHaveBeenCalledWith(ID);
  });

  it.each([
    ["extra", { ...payload, raw: true }],
    ["missing", { id: ID, is_new: true, thread: payload.thread }],
    ["type", { ...payload, balance: "4" }],
    ["ID mismatch", { ...payload, thread: { ...payload.thread, id: payload.thread.participant_2_id } }],
    ["nested participant profile ID", {
      ...payload,
      thread: {
        ...payload.thread,
        participant_1: {
          id: payload.thread.participant_2_id,
          username: "mismatch",
          display_name: null,
          avatar_url: null,
          location_text: null,
          is_online: false,
          last_seen_at: null,
        },
      },
    }],
    ["missing participant_1", {
      ...payload,
      thread: (() => {
        const { participant_1: _participant, ...missing } = payload.thread;
        return missing;
      })(),
    }],
    ["missing participant_2", {
      ...payload,
      thread: (() => {
        const { participant_2: _participant, ...missing } = payload.thread;
        return missing;
      })(),
    }],
    ["participant roles", {
      ...payload,
      thread: {
        ...payload.thread,
        participant_1: { ...payload.thread.participant_1, roles: ["user"] },
      },
    }],
    ["participant account_deleted", {
      ...payload,
      thread: {
        ...payload.thread,
        participant_2: { ...payload.thread.participant_2, account_deleted: true },
      },
    }],
  ])("does not commit or navigate for malformed %s responses", async (_kind, response) => {
    const commit = vi.fn();
    const navigate = vi.fn();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response)));
    vi.stubGlobal("crypto", { randomUUID: () => "web-thread-key-000002" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(createOrFindThread(payload.thread.participant_2_id).then((result) => {
      commit(result);
      navigate(result.id);
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
