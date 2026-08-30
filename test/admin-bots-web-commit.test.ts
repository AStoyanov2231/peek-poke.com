import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminBot, AdminBotCollectResult } from "@peekpoke/shared";
import {
  applyWebBotCollectionResult,
  collectAndApplyWebBot,
} from "@/data/bot-collection";
import { webQueryKeys } from "@/data/web-query";

const BOT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_BOT_ID = "22222222-2222-4222-8222-222222222222";
const VIEWER_ID = "33333333-3333-4333-8333-333333333333";
const LOCATION = { lat: 42.5, lng: 23.25 };
const BOTS: AdminBot[] = [
  { id: BOT_ID, ...LOCATION },
  { id: OTHER_BOT_ID, lat: 42.6, lng: 23.35 },
];

afterEach(() => vi.unstubAllGlobals());

describe("web bot collection commits", () => {
  it.each([
    { ok: true, balance: 3 } as const,
    { ok: false, reason: "already_collected", balance: 3 } as const,
  ])("commits balance and removes/invalidates for applied outcome %#", async (result) => {
    const queryClient = queryClientMock();
    await applyWebBotCollectionResult(queryClient, BOT_ID, VIEWER_ID, LOCATION, result);

    expect(queryClient.setQueryData).toHaveBeenCalledTimes(2);
    expect(queryClient.setQueryData).toHaveBeenNthCalledWith(1, webQueryKeys.coins, { balance: 3 });
    expect(queryClient.setQueryData).toHaveBeenNthCalledWith(
      2,
      webQueryKeys.bots(VIEWER_ID, LOCATION.lat, LOCATION.lng),
      expect.any(Function),
    );
    const updater = queryClient.setQueryData.mock.calls[1][1] as (bots: AdminBot[]) => AdminBot[];
    expect(updater(BOTS)).toEqual([BOTS[1]]);
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: webQueryKeys.bots(VIEWER_ID, LOCATION.lat, LOCATION.lng),
    });
  });

  it("commits only the authoritative at-capacity balance", async () => {
    const queryClient = queryClientMock();
    await applyWebBotCollectionResult(queryClient, BOT_ID, VIEWER_ID, LOCATION, {
      ok: false,
      reason: "at_capacity",
      balance: 5,
    });

    expect(queryClient.setQueryData).toHaveBeenCalledTimes(1);
    expect(queryClient.setQueryData).toHaveBeenCalledWith(webQueryKeys.coins, { balance: 5 });
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it.each([
    "invalid_request",
    "location_stale",
    "wallet_not_found",
    "not_found",
    "too_far",
  ] as const)("does not commit the %s outcome", async (reason) => {
    const queryClient = queryClientMock();
    await applyWebBotCollectionResult(queryClient, BOT_ID, VIEWER_ID, LOCATION, { ok: false, reason });
    expect(queryClient.setQueryData).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed", vi.fn(async () => response({ ok: true, balance: 3, raw: true }))],
    ["network", vi.fn(async () => { throw new TypeError("offline"); })],
  ])("does not commit a %s transport failure", async (_label, fetchMock) => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const queryClient = queryClientMock();

    await expect(collectAndApplyWebBot(queryClient, BOT_ID, VIEWER_ID, LOCATION)).resolves.toBe(false);
    expect(queryClient.setQueryData).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });
});

function queryClientMock() {
  return {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(async () => undefined),
  };
}

function response(payload: AdminBotCollectResult | Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    headers: { "x-request-id": "bots-web-commit" },
  });
}
