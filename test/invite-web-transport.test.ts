import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptInvite, fetchInviteLink } from "@/data/invites";

const INVITER_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = `v1.${INVITER_ID}.1999999999.${"a".repeat(43)}`;
const URL = `https://www.peek-poke.com/invite/${TOKEN}`;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = "test";
  vi.stubGlobal("window", { location: { origin: "https://www.peek-poke.com" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("web invite transports", () => {
  it("validates links before QR/copy/share consumers receive them", async () => {
    const fetchMock = response({ invite_url: URL });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchInviteLink()).resolves.toEqual({ invite_url: URL });
    expect(fetchMock).toHaveBeenCalledWith("/api/invites", expect.objectContaining({
      cache: "no-store",
      signal: expect.any(AbortSignal),
    }));
  });

  it.each([
    ["extra", { invite_url: URL, raw: true }],
    ["missing", {}],
    ["type", { invite_url: 42 }],
    ["URL", { invite_url: "javascript:alert(1)" }],
    ["token", { invite_url: "https://www.peek-poke.com/invite/not-a-token" }],
  ])("rejects malformed %s link 2xx", async (_kind, payload) => {
    vi.stubGlobal("fetch", response(payload));
    await expect(fetchInviteLink()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
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

  it("accepts an expected local HTTP app origin", async () => {
    process.env.NODE_ENV = "development";
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:3000" } });
    const localUrl = `http://127.0.0.1:3000/invite/${TOKEN}`;
    vi.stubGlobal("fetch", response({ invite_url: localUrl }));
    await expect(fetchInviteLink()).resolves.toEqual({ invite_url: localUrl });
  });

  it.each([
    ["public host in development", "development", "http://www.peek-poke.com"],
    ["loopback in production", "production", "http://127.0.0.1:3000"],
    ["LAN host in development", "development", "http://192.168.1.20:3000"],
  ])("rejects matching HTTP for %s before QR data", async (_kind, mode, origin) => {
    process.env.NODE_ENV = mode;
    vi.stubGlobal("window", { location: { origin } });
    vi.stubGlobal("fetch", response({ invite_url: `${origin}/invite/${TOKEN}` }));
    let renderedQrData: string | null = null;

    await expect(fetchInviteLink().then((payload) => { renderedQrData = payload.invite_url; }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(renderedQrData).toBeNull();
  });

  it.each([
    ["legacy accepted extra", { profile_id: INVITER_ID, accepted: true }],
    ["missing", {}],
    ["type", { profile_id: 42 }],
    ["wrong profile", { profile_id: "11111111-1111-4111-8111-111111111111" }],
  ])("rejects malformed %s acceptance before navigation", async (_kind, payload) => {
    vi.stubGlobal("fetch", response(payload));
    let navigated = false;

    await expect(acceptInvite(TOKEN).then(() => { navigated = true; }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(navigated).toBe(false);
  });

  it("preserves server errors and shares only the same in-flight token", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }))
      .mockResolvedValue(jsonResponse({ profile_id: INVITER_ID }));
    vi.stubGlobal("fetch", fetchMock);

    const first = acceptInvite(TOKEN);
    const second = acceptInvite(TOKEN);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(jsonResponse({ profile_id: INVITER_ID }));
    await expect(first).resolves.toEqual({ profile_id: INVITER_ID });

    await acceptInvite(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.stubGlobal("fetch", response({
      version: "v1",
      error: "This invite is invalid or expired",
      message: "This invite is invalid or expired",
      code: "INVALID_INVITE",
      request_id: "invite-web-error",
    }, 400));
    await expect(acceptInvite("not-a-token")).rejects.toMatchObject({
      code: "INVALID_INVITE",
      status: 400,
      requestId: "invite-web-error",
    });
  });

  it("rejects a valid-looking 2xx for an invalid token before navigation", async () => {
    vi.stubGlobal("fetch", response({ profile_id: INVITER_ID }));
    let navigated = false;

    await expect(acceptInvite("not-a-token").then(() => { navigated = true; }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(navigated).toBe(false);
  });
});

function response(payload: unknown, status = 200) {
  return vi.fn(async () => jsonResponse(payload, status));
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "x-request-id": "invite-web-request" },
  });
}
