import { afterEach, describe, expect, it, vi } from "vitest";
import { createPoke } from "@/data/pokes";

vi.mock("expo-crypto", () => ({ randomUUID: () => "11111111-1111-4111-8111-111111111111" }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "token" } } })) } } }));
vi.mock("@/lib/env", () => ({ env: { apiBaseUrl: "https://www.peek-poke.com" } }));

const RECIPIENT_ID = "22222222-2222-4222-8222-222222222222";
const RETRY_KEY = "33333333-3333-4333-8333-333333333333";

afterEach(() => vi.unstubAllGlobals());

describe("native Poke transport", () => {
  it("uses the supplied stable idempotency key when a Send Poke attempt is retried", async () => {
    const response = { poke: { id: "44444444-4444-4444-8444-444444444444", senderId: "11111111-1111-4111-8111-111111111111", recipientId: RECIPIENT_ID, activity: "coffee", customLabel: null, note: null, status: "pending", expiresAt: "2026-09-09T10:00:00.000Z", createdAt: "2026-09-08T10:00:00.000Z", respondedAt: null, threadId: null }, replayed: false };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetchMock);
    const request = { recipientId: RECIPIENT_ID, activity: "coffee" as const, customLabel: null, note: null };

    await createPoke(request, { idempotencyKey: RETRY_KEY });
    await createPoke(request, { idempotencyKey: RETRY_KEY });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get("idempotency-key")).toBe(RETRY_KEY);
    }
  });
});

  it("reuses the response idempotency key after a failed Poke action", async () => {
    const { respondToPoke } = await import("@/data/pokes");
    const pokeId = "55555555-5555-4555-8555-555555555555";
    const response = {
      poke: {
        id: pokeId,
        senderId: RECIPIENT_ID,
        recipientId: "11111111-1111-4111-8111-111111111111",
        activity: "coffee",
        customLabel: null,
        note: null,
        status: "later",
        expiresAt: "2026-09-09T10:00:00.000Z",
        createdAt: "2026-09-08T10:00:00.000Z",
        respondedAt: "2026-09-08T10:01:00.000Z",
        threadId: null,
      },
      replayed: false,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: "v1",
        error: "Connection interrupted. Please try again.",
        message: "Connection interrupted. Please try again.",
        code: "SERVICE_UNAVAILABLE",
        request_id: null,
      }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(respondToPoke(pokeId, { action: "later" })).rejects.toThrow("Connection interrupted");
    await expect(respondToPoke(pokeId, { action: "later" })).resolves.toMatchObject({ replayed: false });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [first, second] = fetchMock.mock.calls;
    expect(new Headers(first[1]?.headers).get("idempotency-key")).toBe(
      new Headers(second[1]?.headers).get("idempotency-key"),
    );
  });
