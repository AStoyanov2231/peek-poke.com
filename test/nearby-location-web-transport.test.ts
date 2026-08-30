import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  nearbyQueryOptions,
  updateWebLocation,
  WEB_LOCATION_UPDATE_TIMEOUT_MS,
  webQueryKeys,
} from "@/data/web-query";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const LOCATION = { lat: 42.6977, lng: 23.3219 };
const user = {
  userId: USER_ID,
  username: "ada",
  display_name: "Ada",
  avatar_url: null,
  is_online: true,
  last_seen_at: "2026-08-07T12:00:00.000Z",
  lat: 42.698,
  lng: 23.322,
};

describe("web nearby and location transports", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co"));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ["extra", { users: [{ ...user, raw_secret: true }] }],
    ["missing", { users: [{ ...user, is_online: undefined }] }],
    ["duplicate", { users: [user, user] }],
    ["self", { users: [{ ...user, userId: VIEWER_ID }] }],
    ["unquantized", { users: [{ ...user, lat: 42.69771 }] }],
    ["foreign avatar", { users: [{
      ...user,
      avatar_url: `https://project.supabase.co/storage/v1/object/public/profile-photos/${VIEWER_ID}/avatar.jpg`,
    }] }],
    ["over-cardinality", { users: Array.from({ length: 101 }, (_, index) => ({
      ...user,
      userId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    })) }],
  ])("rejects malformed 2xx nearby %s before cache and markers", async (_label, payload) => {
    vi.stubGlobal("fetch", response(payload));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const options = nearbyQueryOptions(LOCATION, VIEWER_ID);

    await expect(client.fetchQuery(options)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
    expect(client.getQueryData(webQueryKeys.nearby(VIEWER_ID, LOCATION.lat, LOCATION.lng)))
      .toBeUndefined();
  });

  it("accepts only the strict nearby payload and sends exact coordinates", async () => {
    const fetchMock = response({ users: [user] });
    vi.stubGlobal("fetch", fetchMock);

    await expect(nearbyQueryOptions(LOCATION, VIEWER_ID).queryFn?.({
      signal: new AbortController().signal,
    } as never)).resolves.toEqual([user]);
    expect(fetchMock).toHaveBeenCalledWith("/api/nearby", expect.objectContaining({
      body: JSON.stringify(LOCATION),
      signal: expect.any(AbortSignal),
    }));
  });

  it.each([
    {},
    { ok: false },
    { ok: true, raw: true },
  ])("rejects malformed location acknowledgements %#", async (payload) => {
    vi.stubGlobal("fetch", response(payload));
    await expect(updateWebLocation(LOCATION)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
  });

  it("accepts the exact location acknowledgement", async () => {
    vi.stubGlobal("fetch", response({ ok: true }));
    await expect(updateWebLocation(LOCATION)).resolves.toEqual({ ok: true });
  });

  it("normalizes a location network failure without acknowledging freshness", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));

    await expect(updateWebLocation(LOCATION)).rejects.toMatchObject({
      code: "NETWORK_UNAVAILABLE",
      status: 0,
    });
  });

  it("bounds a pending location request with the canonical deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));

    const request = expect(updateWebLocation(LOCATION)).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
      status: 0,
    });
    await vi.advanceTimersByTimeAsync(WEB_LOCATION_UPDATE_TIMEOUT_MS + 1);
    await request;
  });
});

function response(payload: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(payload), {
    headers: { "x-request-id": "nearby-web-request" },
  }));
}
