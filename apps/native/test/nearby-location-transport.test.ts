import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchNearby,
  LOCATION_UPDATE_TIMEOUT_MS,
  updateLocation,
} from "@/data/discovery/api";
import { nativeQueryKeys } from "@/data/query-keys";

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

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));
vi.mock("@/lib/env", () => ({
  env: {
    apiBaseUrl: "https://www.peek-poke.com",
    supabaseUrl: "https://project.supabase.co",
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("iOS and Android nearby/location transport barrier", () => {
  it.each([
    ["ios", "extra", { users: [{ ...user, raw_secret: true }] }],
    ["android", "missing", { users: [{ ...user, is_online: undefined }] }],
    ["ios", "duplicate", { users: [user, user] }],
    ["android", "self", { users: [{ ...user, userId: VIEWER_ID }] }],
    ["ios", "unquantized", { users: [{ ...user, lng: 23.32194 }] }],
    ["android", "foreign avatar", { users: [{
      ...user,
      avatar_url: `https://project.supabase.co/storage/v1/object/public/profile-photos/${VIEWER_ID}/avatar.jpg`,
    }] }],
    ["ios", "over-cardinality", { users: Array.from({ length: 101 }, (_, index) => ({
      ...user,
      userId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    })) }],
  ])("blocks %s malformed %s response before cache/markers", async (_platform, _label, payload) => {
    vi.stubGlobal("fetch", response(payload));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = nativeQueryKeys.discovery.nearby(VIEWER_ID, LOCATION.lat, LOCATION.lng);

    await expect(client.fetchQuery({
      queryKey: key,
      queryFn: () => fetchNearby(LOCATION, VIEWER_ID),
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it.each(["ios", "android"])("accepts the exact %s nearby response", async () => {
    vi.stubGlobal("fetch", response({ users: [user] }));
    await expect(fetchNearby(LOCATION, VIEWER_ID)).resolves.toEqual([user]);
  });

  it.each([
    ["ios", {}],
    ["android", { ok: false }],
    ["ios", { ok: true, raw: true }],
  ])("rejects malformed %s location acknowledgement %#", async (_platform, payload) => {
    vi.stubGlobal("fetch", response({ token: "signed-location-attestation" }, payload));
    await expect(updateLocation(LOCATION)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
  });

  it.each(["ios", "android"])("accepts the exact %s location acknowledgement", async () => {
    const fetchMock = response({ token: "signed-location-attestation" }, { ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await expect(updateLocation(LOCATION)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://www.peek-poke.com/api/location/attestation", expect.objectContaining({
      body: JSON.stringify(LOCATION),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://www.peek-poke.com/api/location", expect.objectContaining({
      headers: expect.objectContaining({ "x-location-attestation": "signed-location-attestation" }),
    }));
  });

  it("turns a bounded location transport deadline into a canonical retryable failure", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    })));

    const request = updateLocation(LOCATION);
    const rejected = expect(request).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
      status: 0,
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(LOCATION_UPDATE_TIMEOUT_MS + 1);
    await rejected;
  });
});

function response(...payloads: unknown[]) {
  let index = 0;
  return vi.fn(async () => new Response(JSON.stringify(payloads[Math.min(index++, payloads.length - 1)]), {
    headers: { "x-request-id": "nearby-native-request" },
  }));
}
