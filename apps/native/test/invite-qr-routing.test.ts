import { describe, expect, it } from "vitest";
import { loginRouteForPendingIntent, routeAfterBootstrap } from "@/lib/auth-return-navigation";
import { inviteTokenForReturn, inviteTokenFromQrContent } from "@/lib/invite-qr-link";

const INVITER_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = `v1.${INVITER_ID}.1999999999.${"a".repeat(43)}`;
const QR_URL = `https://www.peek-poke.com/invite/${TOKEN}`;

describe("native invitation QR routing", () => {
  it("routes an issued ShareSheet invite to its explicit connect route instead of Circle joining", () => {
    const token = inviteTokenFromQrContent(QR_URL);

    expect(token).toBe(TOKEN);
    expect(`/invite/${token}`).toBe(`/invite/${TOKEN}`);
  });

  it("keeps arbitrary and external QR payloads on the existing Circle path", () => {
    expect(inviteTokenFromQrContent("circle-qr:weekend-coffee")).toBeNull();
    expect(inviteTokenFromQrContent(`https://evil.example/invite/${TOKEN}`)).toBeNull();
    expect(inviteTokenFromQrContent("https://www.peek-poke.com/invite/not-a-token")).toBeNull();
  });

  it("preserves a signed invite through the actual root sign-in, admission, onboarding, and completed routes", () => {
    const pendingInvite = inviteTokenForReturn(TOKEN);

    expect(pendingInvite).toBe(TOKEN);
    expect(loginRouteForPendingIntent(pendingInvite)).toEqual({
      pathname: "/(auth)/login",
      params: { invite: TOKEN },
    });
    expect(routeAfterBootstrap({ age_admission: { status: "pending", decided_at: null }, onboarding_completed: false }, pendingInvite)).toEqual({
      pathname: "/age-admission",
      params: { invite: TOKEN },
    });
    expect(routeAfterBootstrap({ age_admission: { status: "adult", decided_at: "2026-09-08T00:00:00.000Z" }, onboarding_completed: false }, pendingInvite)).toEqual({
      pathname: "/onboarding",
      params: { invite: TOKEN },
    });
    expect(routeAfterBootstrap({ age_admission: { status: "adult", decided_at: "2026-09-08T00:00:00.000Z" }, onboarding_completed: true }, pendingInvite)).toBe(`/invite/${TOKEN}`);
  });

  it("does not treat a raw inviter UUID as a signed invitation return token", () => {
    expect(inviteTokenForReturn(INVITER_ID)).toBeUndefined();
  });
});
