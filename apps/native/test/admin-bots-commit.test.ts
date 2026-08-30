import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyNativeBotCollectionResult,
  collectAndApplyNativeBot,
} from "@/data/discovery/bot-collection";

const BOT_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION = { lat: 42.5, lng: 23.25 };

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));
vi.mock("@/lib/env", () => ({ env: { apiBaseUrl: "https://www.peek-poke.com" } }));

afterEach(() => vi.unstubAllGlobals());

describe("native bot collection commits", () => {
  it.each([
    { ok: true, balance: 3 } as const,
    { ok: false, reason: "already_collected", balance: 3 } as const,
  ])("commits balance and removes/refetches for applied outcome %#", (result) => {
    const actions = actionMocks();
    applyNativeBotCollectionResult(BOT_ID, result, actions);
    expect(actions.setBalance).toHaveBeenCalledTimes(1);
    expect(actions.setBalance).toHaveBeenCalledWith(3);
    expect(actions.markCollected).toHaveBeenCalledTimes(1);
    expect(actions.markCollected).toHaveBeenCalledWith(BOT_ID);
    expect(actions.refetchBots).toHaveBeenCalledTimes(1);
  });

  it("commits only the authoritative at-capacity balance", () => {
    const actions = actionMocks();
    applyNativeBotCollectionResult(BOT_ID, {
      ok: false,
      reason: "at_capacity",
      balance: 5,
    }, actions);
    expect(actions.setBalance).toHaveBeenCalledTimes(1);
    expect(actions.setBalance).toHaveBeenCalledWith(5);
    expect(actions.markCollected).not.toHaveBeenCalled();
    expect(actions.refetchBots).not.toHaveBeenCalled();
  });

  it.each([
    "invalid_request",
    "location_stale",
    "wallet_not_found",
    "not_found",
    "too_far",
  ] as const)("does not commit the %s outcome", (reason) => {
    const actions = actionMocks();
    applyNativeBotCollectionResult(BOT_ID, { ok: false, reason }, actions);
    expect(actions.setBalance).not.toHaveBeenCalled();
    expect(actions.markCollected).not.toHaveBeenCalled();
    expect(actions.refetchBots).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed", vi.fn(async () => response({ ok: true, balance: 3, raw: true }))],
    ["network", vi.fn(async () => { throw new TypeError("offline"); })],
  ])("does not commit a %s transport failure", async (_label, fetchMock) => {
    vi.stubGlobal("fetch", fetchMock);
    const actions = actionMocks();
    await expect(collectAndApplyNativeBot(BOT_ID, LOCATION, actions)).rejects.toMatchObject(
      { code: _label === "malformed" ? "INVALID_RESPONSE" : "NETWORK_UNAVAILABLE" },
    );
    expect(actions.setBalance).not.toHaveBeenCalled();
    expect(actions.markCollected).not.toHaveBeenCalled();
    expect(actions.refetchBots).not.toHaveBeenCalled();
  });
});

function actionMocks() {
  return {
    setBalance: vi.fn(),
    markCollected: vi.fn(),
    refetchBots: vi.fn(),
  };
}

function response(payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    headers: { "x-request-id": "bots-native-commit" },
  });
}
