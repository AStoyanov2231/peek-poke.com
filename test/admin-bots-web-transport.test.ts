import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { botsQueryOptions, webQueryKeys } from "@/data/web-query";
import { collectBot } from "@/lib/bots";

const BOT_ID = "11111111-1111-4111-8111-111111111111";
const VIEWER_ID = "33333333-3333-4333-8333-333333333333";
const LOCATION = { lat: 42.5, lng: 23.25 };

afterEach(() => vi.unstubAllGlobals());

describe("web bot transports", () => {
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
    const options = botsQueryOptions(LOCATION, VIEWER_ID);
    await expect(client.fetchQuery(options)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
    expect(client.getQueryData(webQueryKeys.bots(VIEWER_ID, LOCATION.lat, LOCATION.lng))).toBeUndefined();
  });

  it("uses exact encoded coordinates and accepts a strict list", async () => {
    const fetchMock = response([{ id: BOT_ID, ...LOCATION }]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(botsQueryOptions(LOCATION, VIEWER_ID).queryFn?.({ signal: new AbortController().signal } as never))
      .resolves.toEqual([{ id: BOT_ID, ...LOCATION }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bots?lat=42.5&lng=23.25",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("treats a lost-response retry as collected only after exact validation", async () => {
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
  ])("rejects malformed collect payload without a state result %#", async (payload) => {
    vi.stubGlobal("fetch", response(payload));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(collectBot(BOT_ID, LOCATION)).resolves.toBe(false);
  });
});

function response(payload: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(payload), {
    headers: { "x-request-id": "bots-web-request" },
  }));
}

function clientWithoutRetries() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
