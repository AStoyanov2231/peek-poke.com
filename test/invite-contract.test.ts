import { describe, expect, it } from "vitest";
import {
  endpointContracts,
  inviteAcceptanceResponseSchema,
  inviteAcceptanceResponseSchemaFor,
  inviteAcceptanceResponseSchemaForToken,
  inviteLinkResponseSchema,
  inviteLinkResponseSchemaForOrigin,
  inviterIdFromInviteToken,
} from "@peekpoke/shared";

const INVITER_ID = "22222222-2222-4222-8222-222222222222";
const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = `v1.${INVITER_ID}.1999999999.${"a".repeat(43)}`;
const SELF_TOKEN = `v1.${VIEWER_ID}.1999999999.${"b".repeat(43)}`;
const URL = `https://www.peek-poke.com/invite/${TOKEN}`;

describe("invite shared contracts", () => {
  it("accepts the exact invite-link and token-bound self/other success DTO", () => {
    expect(inviteLinkResponseSchema.parse({ invite_url: URL })).toEqual({ invite_url: URL });
    expect(inviteAcceptanceResponseSchemaFor(INVITER_ID).parse({
      profile_id: INVITER_ID,
    })).toEqual({ profile_id: INVITER_ID });
    expect(inviteAcceptanceResponseSchemaForToken(SELF_TOKEN).parse({
      profile_id: VIEWER_ID,
    })).toEqual({ profile_id: VIEWER_ID });
    expect(inviterIdFromInviteToken(TOKEN)).toBe(INVITER_ID);
  });

  it.each([
    ["extra", { invite_url: URL, token: TOKEN }],
    ["missing", {}],
    ["type", { invite_url: 42 }],
    ["relative", { invite_url: `/invite/${TOKEN}` }],
    ["wrong path", { invite_url: `https://www.peek-poke.com/profile/${TOKEN}` }],
    ["query", { invite_url: `${URL}?leak=1` }],
    ["invalid token", { invite_url: "https://www.peek-poke.com/invite/not-a-token" }],
  ])("rejects %s invite-link DTOs", (_kind, payload) => {
    expect(inviteLinkResponseSchema.safeParse(payload).success).toBe(false);
  });

  it.each([
    ["evil origin", `https://evil.example/invite/${TOKEN}`],
    ["HTTP downgrade", `http://www.peek-poke.com/invite/${TOKEN}`],
    ["port mismatch", `https://www.peek-poke.com:444/invite/${TOKEN}`],
    ["subdomain mismatch", `https://invites.peek-poke.com/invite/${TOKEN}`],
  ])("rejects an origin-bound %s", (_kind, inviteUrl) => {
    expect(inviteLinkResponseSchemaForOrigin("https://www.peek-poke.com").safeParse({
      invite_url: inviteUrl,
    }).success).toBe(false);
  });

  it("accepts HTTP only when the explicitly expected local origin is HTTP", () => {
    const localUrl = `http://127.0.0.1:3000/invite/${TOKEN}`;
    expect(inviteLinkResponseSchemaForOrigin("http://127.0.0.1:3000", {
      allowDevelopmentHttp: true,
    }).parse({
      invite_url: localUrl,
    })).toEqual({ invite_url: localUrl });
    expect(inviteLinkResponseSchemaForOrigin("https://127.0.0.1:3000").safeParse({
      invite_url: localUrl,
    }).success).toBe(false);
  });

  it.each([
    ["public host in development", "http://www.peek-poke.com", true],
    ["loopback in production", "http://127.0.0.1:3000", false],
    ["LAN host in development", "http://192.168.1.20:3000", true],
  ])("rejects HTTP for %s", (_kind, origin, allowDevelopmentHttp) => {
    expect(inviteLinkResponseSchemaForOrigin(origin, { allowDevelopmentHttp }).safeParse({
      invite_url: `${origin}/invite/${TOKEN}`,
    }).success).toBe(false);
  });

  it.each([
    ["legacy accepted extra", { profile_id: INVITER_ID, accepted: true }],
    ["extra", { profile_id: INVITER_ID, raw: true }],
    ["missing", {}],
    ["type", { profile_id: 42 }],
    ["invalid UUID", { profile_id: "inviter" }],
  ])("rejects %s acceptance DTOs", (_kind, payload) => {
    expect(inviteAcceptanceResponseSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a success profile that does not match the token inviter", () => {
    expect(inviteAcceptanceResponseSchemaFor(INVITER_ID).safeParse({
      profile_id: VIEWER_ID,
    }).success).toBe(false);
  });

  it("rejects every acceptance 2xx shape when the invite token syntax is invalid", () => {
    expect(inviteAcceptanceResponseSchemaForToken("not-a-token").safeParse({
      profile_id: INVITER_ID,
    }).success).toBe(false);
    expect(inviteAcceptanceResponseSchemaForToken(TOKEN).safeParse({
      profile_id: INVITER_ID,
    }).success).toBe(true);
  });

  it("registers both endpoint contracts", () => {
    expect(endpointContracts.inviteLink).toMatchObject({ method: "GET", path: "/api/invites" });
    expect(endpointContracts.inviteAcceptance).toMatchObject({
      method: "POST",
      path: "/api/invites/:inviterId",
    });
  });
});
