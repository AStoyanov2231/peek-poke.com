import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptInvite, fetchInviteLink } from "@/data/social/api";

const INVITER_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = `v1.${INVITER_ID}.1999999999.${"a".repeat(43)}`;
const URL = `https://www.peek-poke.com/invite/${TOKEN}`;

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

const nativeEnv = vi.hoisted(() => ({ apiBaseUrl: "https://www.peek-poke.com" }));

vi.mock("@/lib/env", () => ({ env: nativeEnv }));

vi.mock("expo-crypto", () => ({ randomUUID: () => "native-invite-key-000001" }));

beforeEach(() => {
  nativeEnv.apiBaseUrl = "https://www.peek-poke.com";
  vi.stubGlobal("__DEV__", false);
});

afterEach(() => vi.unstubAllGlobals());

describe("native invite transports", () => {
  it("returns only a validated, uncached invite link", async () => {
    const fetchMock = response({ invite_url: URL });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchInviteLink()).resolves.toEqual({ invite_url: URL });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.peek-poke.com/api/invites",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });

  it.each([
    ["extra link", { invite_url: URL, raw: true }, "link"],
    ["missing link", {}, "link"],
    ["invalid URL", { invite_url: "https://www.peek-poke.com/invite/nope" }, "link"],
    ["legacy accepted extra", { profile_id: INVITER_ID, accepted: true }, "accept"],
    ["wrong profile", { profile_id: "11111111-1111-4111-8111-111111111111" }, "accept"],
    ["type", { profile_id: 42 }, "accept"],
  ])("rejects malformed %s 2xx before UI side effects", async (_kind, payload, operation) => {
    vi.stubGlobal("fetch", response(payload));
    let committed = false;
    const request = operation === "link" ? fetchInviteLink() : acceptInvite(TOKEN);
    await expect(request.then(() => { committed = true; }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(committed).toBe(false);
  });

  it.each([
    ["evil origin", `https://evil.example/invite/${TOKEN}`],
    ["HTTP downgrade", `http://www.peek-poke.com/invite/${TOKEN}`],
    ["port mismatch", `https://www.peek-poke.com:444/invite/${TOKEN}`],
    ["subdomain mismatch", `https://invites.peek-poke.com/invite/${TOKEN}`],
  ])("rejects a forged %s 2xx before query or QR data is available", async (_kind, inviteUrl) => {
    vi.stubGlobal("fetch", response({ invite_url: inviteUrl }));
    let renderedQrData: string | null = null;

    await expect(fetchInviteLink().then((payload) => { renderedQrData = payload.invite_url; }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(renderedQrData).toBeNull();
  });

  it("accepts an explicitly configured local HTTP API origin", async () => {
    vi.stubGlobal("__DEV__", true);
    nativeEnv.apiBaseUrl = "http://127.0.0.1:3000";
    const localUrl = `http://127.0.0.1:3000/invite/${TOKEN}`;
    vi.stubGlobal("fetch", response({ invite_url: localUrl }));

    await expect(fetchInviteLink()).resolves.toEqual({ invite_url: localUrl });
  });

  it.each([
    ["public host in development", true, "http://www.peek-poke.com"],
    ["loopback in production", false, "http://127.0.0.1:3000"],
    ["LAN host in development", true, "http://192.168.1.20:3000"],
  ])("rejects matching HTTP for %s before QR data", async (_kind, development, origin) => {
    vi.stubGlobal("__DEV__", development);
    nativeEnv.apiBaseUrl = origin;
    vi.stubGlobal("fetch", response({ invite_url: `${origin}/invite/${TOKEN}` }));
    let renderedQrData: string | null = null;

    await expect(fetchInviteLink().then((payload) => { renderedQrData = payload.invite_url; }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(renderedQrData).toBeNull();
  });

  it("single-flights the same token and permits a fresh settled retry", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }))
      .mockResolvedValue(jsonResponse({ profile_id: INVITER_ID }));
    vi.stubGlobal("fetch", fetchMock);

    const first = acceptInvite(TOKEN);
    const second = acceptInvite(TOKEN);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveFetch(jsonResponse({ profile_id: INVITER_ID }));
    await first;
    await acceptInvite(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves invalid-token server errors", async () => {
    vi.stubGlobal("fetch", response({
      version: "v1",
      error: "This invite is invalid or expired",
      message: "This invite is invalid or expired",
      code: "INVALID_INVITE",
      request_id: "invite-native-error",
    }, 400));
    await expect(acceptInvite("not-a-token")).rejects.toMatchObject({
      code: "INVALID_INVITE",
      status: 400,
      requestId: "invite-native-error",
    });
  });

  it("rejects a valid-looking 2xx for an invalid token before invalidation or navigation", async () => {
    vi.stubGlobal("fetch", response({ profile_id: INVITER_ID }));
    let committed = false;

    await expect(acceptInvite("not-a-token").then(() => { committed = true; }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(committed).toBe(false);
  });
});

function response(payload: unknown, status = 200) {
  return vi.fn(async () => jsonResponse(payload, status));
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "x-request-id": "invite-native-request" },
  });
}
