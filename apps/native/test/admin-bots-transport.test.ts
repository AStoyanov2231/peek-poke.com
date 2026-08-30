import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectBot, fetchBots } from "@/data/discovery/api";
import { nativeQueryKeys } from "@/data/query-keys";

const BOT_ID = "11111111-1111-4111-8111-111111111111";
const VIEWER_ID = "22222222-2222-4222-8222-222222222222";
const LOCATION = { lat: 42.5, lng: 23.25 };

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));
vi.mock("@/lib/env", () => ({ env: { apiBaseUrl: "https://www.peek-poke.com" } }));

afterEach(() => vi.unstubAllGlobals());

describe("native bot transports", () => {
  it.each([
    ["over-limit", Array.from({ length: 51 }, (_, index) => ({
      id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000001`, ...LOCATION,
    }))],
    ["extra", [{ id: BOT_ID, ...LOCATION, raw: true }]],
    ["duplicate-ID", [
      { id: BOT_ID, ...LOCATION },
      { id: BOT_ID, lat: 42.6, lng: 23.35 },
    ]],
    ["type", [{ id: BOT_ID, lat: "42.5", lng: 23.25 }]],
  ])("rejects malformed %s list before query caching", async (_label, payload) => {
    vi.stubGlobal("fetch", response(payload));
    const client = clientWithoutRetries();
    const key = nativeQueryKeys.discovery.bots(VIEWER_ID, LOCATION.lat, LOCATION.lng);
    await expect(client.fetchQuery({ queryKey: key, queryFn: () => fetchBots(LOCATION) }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it("uses exact coordinates and accepts a strict list", async () => {
    const fetchMock = response([{ id: BOT_ID, ...LOCATION }]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchBots(LOCATION)).resolves.toEqual([{ id: BOT_ID, ...LOCATION }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.peek-poke.com/api/bots?lat=42.5&lng=23.25",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("keeps same-coordinate bot caches scoped to the authenticated viewer", () => {
    expect(nativeQueryKeys.discovery.bots(VIEWER_ID, LOCATION.lat, LOCATION.lng))
      .not.toEqual(nativeQueryKeys.discovery.bots(BOT_ID, LOCATION.lat, LOCATION.lng));
  });

  it("returns a validated already-collected retry with its authoritative balance", async () => {
    vi.stubGlobal("fetch", response({ ok: false, reason: "already_collected", balance: 3 }));
    await expect(collectBot(BOT_ID, LOCATION)).resolves.toEqual({
      ok: false,
      reason: "already_collected",
      balance: 3,
    });
  });

  it.each([
    { ok: true, balance: 3, raw: true },
    { ok: false, reason: "already_collected" },
    { ok: false, reason: "unknown" },
  ])("rejects malformed collect payload before caller commits %#", async (payload) => {
    vi.stubGlobal("fetch", response(payload));
    await expect(collectBot(BOT_ID, LOCATION)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
  });
});

function response(payload: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(payload), {
    headers: { "x-request-id": "bots-native-request" },
  }));
}

function clientWithoutRetries() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
