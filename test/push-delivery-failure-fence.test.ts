import { afterEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOKEN = "ExpoPushToken[device-token]";
const REGISTERED_AT = "2026-08-07T12:34:56.000Z";

const mocks = vi.hoisted(() => {
  const selectQuery: Record<string, unknown> = {};
  selectQuery.select = vi.fn(() => selectQuery);
  selectQuery.eq = vi.fn(() => selectQuery);
  selectQuery.is = vi.fn(() => selectQuery);
  selectQuery.limit = vi.fn(async () => ({
    data: [{
      token: "ExpoPushToken[device-token]",
      platform: "ios",
      provider: "expo",
      owner_session_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      last_registered_at: "2026-08-07T12:34:56.000Z",
    }],
    error: null,
  }));

  const updateQuery: Record<string, unknown> & PromiseLike<{ error: null }> = {
    then(onFulfilled, onRejected) {
      return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
    },
  };
  updateQuery.update = vi.fn(() => updateQuery);
  updateQuery.eq = vi.fn(() => updateQuery);
  updateQuery.is = vi.fn(() => updateQuery);

  const from = vi.fn()
    .mockReturnValueOnce(selectQuery)
    .mockReturnValueOnce(updateQuery);
  const rpc = vi.fn();
  return { from, rpc, selectQuery, updateQuery };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import { sendPushToUser } from "@/lib/push/send";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("push delivery-failure cleanup", () => {
  it("revokes only the exact session generation observed before provider delivery", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{
        status: "error",
        message: "Device is not registered",
        details: { error: "DeviceNotRegistered" },
      }],
    }), { status: 200 })));

    await expect(sendPushToUser(USER_ID, {
      title: "New message",
      body: "Hello",
    })).resolves.toBeUndefined();

    expect(mocks.selectQuery.select).toHaveBeenCalledWith(
      "token, platform, provider, owner_session_id, last_registered_at",
    );
    expect(mocks.updateQuery.update).toHaveBeenCalledWith({
      revoked_at: expect.any(String),
    });
    expect(mocks.updateQuery.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(mocks.updateQuery.eq).toHaveBeenCalledWith("token", TOKEN);
    expect(mocks.updateQuery.eq).toHaveBeenCalledWith("last_registered_at", REGISTERED_AT);
    expect(mocks.updateQuery.eq).toHaveBeenCalledWith("owner_session_id", SESSION_ID);
    expect(mocks.updateQuery.is).toHaveBeenCalledWith("revoked_at", null);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
