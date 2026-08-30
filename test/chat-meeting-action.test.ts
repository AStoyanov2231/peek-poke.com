import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { meetingProximityEligible } from "@peekpoke/shared";

const web = readFileSync("src/features/chat/components/ChatProximityBanner.tsx", "utf8");
const native = readFileSync("apps/native/src/components/chat-meeting-action.tsx", "utf8");
const webEligibility = readFileSync("src/features/chat/useProximityToThread.ts", "utf8");
const nativeScreen = readFileSync("apps/native/app/chat/[threadId].tsx", "utf8");
const nativeRooms = readFileSync("apps/native/app/(app)/rooms.tsx", "utf8");
const webBackground = readFileSync("src/features/map/useMeetingDetection.ts", "utf8");
const nativeBackground = readFileSync("apps/native/src/hooks/use-meeting-detection.ts", "utf8");
const webAuth = readFileSync("src/features/auth/useAuth.ts", "utf8");
const webRecovery = readFileSync("src/features/auth/session-recovery.ts", "utf8");
const webPreload = readFileSync("src/components/providers/PreloadProvider.tsx", "utf8");
const nativeRoot = readFileSync("apps/native/app/_layout.tsx", "utf8");
const nativeRecovery = readFileSync("apps/native/src/lib/session-recovery.ts", "utf8");

describe("chat Meet and earn parity", () => {
  it("uses the conservative validated-location proximity prefilter", () => {
    expect(meetingProximityEligible(null)).toBe(false);
    expect(meetingProximityEligible(-1)).toBe(false);
    expect(meetingProximityEligible(130)).toBe(true);
    expect(meetingProximityEligible(131)).toBe(false);
    expect(webEligibility).toContain("acceptedFriend && meetingProximityEligible");
    expect(nativeScreen).toContain("/(app)/rooms");
    expect(nativeRooms).toContain("Scan a QR code");
  });

  it("web exposes a real accessible action with lifecycle and retry states", () => {
    expect(web).toContain("meetingEligible && meetingState !== \"success\"");
    expect(web).toContain("onClick={record}");
    expect(web).toContain("min-h-11");
    expect(web).toContain("Retry Meet and earn");
    expect(web).toContain("Discard meeting retry");
    expect(web).toContain('result.awarded ? "Coin earned" : "Meeting recorded"');
    expect(web).toContain("ownerRef.current !== submissionOwner");
    expect(web).toContain('error.name === "AbortError"');
    expect(web).toContain("web-chat-meeting:");
    expect(web).toContain("unsubscribeMeetingAttempt(accountId, friendId, consumerId)");
    expect(web).toContain("markLocationStale()");
  });

  it("native uses Pressability and a 44 point target only when eligible", () => {
    expect(native).toContain("if (!meetingEligible) return null");
    expect(native).toContain("<Pressable");
    expect(native).toContain('accessibilityRole="button"');
    expect(native).toContain("minHeight: 44");
    expect(native).toContain('result.awarded ? "Coin earned" : "Meeting recorded"');
    expect(native).toContain("ownerRef.current !== submissionOwner");
    expect(native).toContain('error.name === "AbortError"');
    expect(native).toContain("native-chat-meeting:");
    expect(native).toContain("unsubscribeMeetingAttempt(accountId, friendId, consumerId)");
    expect(native).toContain("markDeviceLocationStale(accountId");
  });

  it("uses distinct background consumer ownership without cancelling shared delivery", () => {
    expect(webBackground).toContain("web-background-meeting:");
    expect(webBackground).toContain("meetingPairCompleted(userId, nearby.userId)");
    expect(webBackground).toContain("meetingResponseCompletesPair(data)");
    expect(webBackground).toContain("activeAccountIdRef.current !== userId");
    expect(webBackground).not.toContain("data.awarded || data.already_met");
    expect(webBackground).toContain("unsubscribeMeetingAttempt(userId, friendId, consumerId)");
    expect(webBackground).not.toContain("controller.abort()");
    expect(nativeBackground).toContain("native-background-meeting:");
    expect(nativeBackground).toContain("meetingPairCompleted(profileId, friendId)");
    expect(nativeBackground).toContain("meetingResponseCompletesPair(result)");
    expect(nativeBackground).toContain("activeProfileIdRef.current !== profileId");
    expect(nativeBackground).not.toContain("result.awarded || result.already_met");
    expect(nativeBackground).toContain("unsubscribeMeetingAttempt(profileId, friendId, consumerId)");
    expect(nativeBackground).not.toContain("controller.abort()");
  });

  it("clears app-lifecycle meeting completion state on explicit auth teardown", () => {
    expect(webAuth).toContain("observeMeetingAuthOwner(authUser?.id ?? null)");
    expect(webRecovery.indexOf("observeMeetingAuthOwner(null)"))
      .toBeLessThan(webRecovery.indexOf('replace("/login")'));
    expect(webPreload).toContain("recoverUnauthorizedWebSession()");
    expect(nativeRoot).toContain("observeMeetingAuthOwner(null)");
    expect(nativeRecovery.indexOf("observeMeetingAuthOwner(null)"))
      .toBeLessThan(nativeRecovery.indexOf("if (unauthorizedRecoveryPromise)"));
  });

  it("activates every observed auth owner before web/native state commits", () => {
    expect(webAuth.match(/observeMeetingAuthOwner\(authUser\?\.id \?\? null\)/g)).toHaveLength(2);
    expect(webAuth).toContain("const eventAuthGeneration = ++authGeneration");
    expect(webAuth).toContain("if (!isCurrentAuth(initialAuthGeneration)) return");
    expect(webAuth.indexOf("supabase.auth.onAuthStateChange"))
      .toBeLessThan(webAuth.indexOf("initializeAuth(initialAuthGeneration)"));
    expect(webAuth.indexOf("observeMeetingAuthOwner(authUser?.id ?? null)"))
      .toBeLessThan(webAuth.indexOf("supabase.realtime.setAuth"));
    expect(webAuth.indexOf("observeMeetingAuthOwner(authUser?.id ?? null)"))
      .toBeLessThan(webAuth.indexOf("setUser(authUser)"));
    expect(nativeRoot).toContain("observeMeetingAuthOwner(key.userId)");
    expect(nativeRoot).toContain("observeMeetingAuthOwner(eventKey.userId)");
    expect(nativeRoot.indexOf("observeMeetingAuthOwner(null)"))
      .toBeLessThan(nativeRoot.indexOf("bootstrapCoordinator.invalidate()"));
    expect(nativeRoot.indexOf("observeMeetingAuthOwner(eventKey.userId)"))
      .toBeLessThan(nativeRoot.indexOf("nativePushRegistration.observeAuth(eventKey"));
  });
});
