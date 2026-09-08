import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { meetingProximityEligible } from "@peekpoke/shared";

const web = readFileSync("src/features/chat/components/ChatProximityBanner.tsx", "utf8");
const webMeetupAcknowledgement = readFileSync("src/features/chat/components/MeetupAcknowledgement.tsx", "utf8");
const native = readFileSync("apps/native/src/components/chat-meeting-action.tsx", "utf8");
const webEligibility = readFileSync("src/features/chat/useProximityToThread.ts", "utf8");
const nativeScreen = readFileSync("apps/native/app/chat/[threadId].tsx", "utf8");
const webBackground = readFileSync("src/features/map/useMeetingDetection.ts", "utf8");
const nativeBackground = readFileSync("apps/native/src/hooks/use-meeting-detection.ts", "utf8");
const webAuth = readFileSync("src/features/auth/useAuth.ts", "utf8");
const webRecovery = readFileSync("src/features/auth/session-recovery.ts", "utf8");
const webPreload = readFileSync("src/components/providers/PreloadProvider.tsx", "utf8");
const nativeRoot = readFileSync("apps/native/app/_layout.tsx", "utf8");
const nativeRecovery = readFileSync("apps/native/src/lib/session-recovery.ts", "utf8");

describe("chat meetup confirmation parity", () => {
  it("keeps the dormant reward candidate radius separate from chat acknowledgements", () => {
    expect(meetingProximityEligible(null)).toBe(false);
    expect(meetingProximityEligible(-1)).toBe(false);
    expect(meetingProximityEligible(1_000)).toBe(true);
    expect(meetingProximityEligible(1_001)).toBe(false);
    expect(webEligibility).toContain("eligiblePeerIds.has(otherUserId) || hasCurrentPlanForThread");
    expect(nativeScreen).toContain("ChatMeetupAcknowledgement");
  });

  it("web asks both peers to acknowledge a meetup without making reward or location claims", () => {
    expect(webMeetupAcknowledgement).toContain("Mark that you met?");
    expect(webMeetupAcknowledgement).toContain("Waiting for {name}");
    expect(webMeetupAcknowledgement).toContain("currentMeetup.viewerConfirmed");
    expect(webMeetupAcknowledgement).toContain("{name} marked that you met. Did you?");
    expect(webMeetupAcknowledgement).toContain("You both marked this meetup.");
    expect(webMeetupAcknowledgement).toContain("Plan again");
    expect(webMeetupAcknowledgement.replace(/\s+/g, " ")).toContain("No rewards are attached.");
    expect(webMeetupAcknowledgement).not.toContain("recordMeeting(");
    expect(webMeetupAcknowledgement).not.toContain("rewarded");
    expect(web).toContain("same approximate area");
    expect(web).toContain("each person can mark it in chat");
    expect(web).not.toContain("distanceMeters");
    expect(web).not.toContain("confirmation is not available");
    expect(web).not.toContain("recorded and rewarded");
  });

  it("keeps the future reward transport but hides its unsupported manual claim action", () => {
    expect(native).toContain("if (!meetingEligible || !canAttemptMeetingReward()) return null");
    expect(native).toContain("recordMeeting(");
    expect(native).toContain("native-chat-meeting:");
    expect(native).toContain("unsubscribeMeetingAttempt(accountId, friendId, consumerId)");
  });

  it("uses distinct background consumer ownership without cancelling shared delivery", () => {
    expect(webBackground).toContain("canAttemptMeetingReward()");
    expect(webBackground).toContain("web-background-meeting:");
    expect(webBackground).toContain("meetingEligiblePeerIds");
    expect(webBackground).toContain("meetingPairCompleted(userId, nearby.userId)");
    expect(webBackground).toContain("meetingResponseCompletesPair(data)");
    expect(webBackground).toContain("activeAccountIdRef.current !== userId");
    expect(webBackground).not.toContain("data.awarded || data.already_met");
    expect(webBackground).toContain("unsubscribeMeetingAttempt(userId, friendId, consumerId)");
    expect(webBackground).not.toContain("controller.abort()");
    expect(nativeBackground).toContain("shouldDetectMeetings({");
    expect(nativeBackground).toContain("native-background-meeting:");
    expect(nativeBackground).toContain("meetingEligiblePeerIds");
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
    const signedInBranch = nativeRoot.match(/if \(event === "SIGNED_IN" && session\?\.user\) \{([\s\S]*?)\n      \}/)?.[1];
    expect(signedInBranch).toBeDefined();
    expect(signedInBranch).toMatch(
      /observeMeetingAuthOwner\(eventKey\.userId\);[\s\S]*setSessionUserId\(eventKey\.userId\);/,
    );
    const bootstrapBranch = nativeRoot.match(/\(session: Session\) => \{([\s\S]*?)const promise = bootstrapCoordinator\.start/)?.[1];
    expect(bootstrapBranch).toBeDefined();
    expect(bootstrapBranch).toMatch(
      /observeMeetingAuthOwner\(key\.userId\);[\s\S]*bootstrapUserIdRef\.current = key\.userId;/,
    );
  });
});
