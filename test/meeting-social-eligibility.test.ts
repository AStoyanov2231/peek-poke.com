import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MEETING_CANDIDATE_RADIUS_KM,
  meetingEligiblePeerIds,
  meetingProximityEligible,
} from "@peekpoke/shared";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
const POKE_PEER = "33333333-3333-4333-8333-333333333333";

describe("meeting social eligibility", () => {
  it("includes only accepted Poke peers alongside friends", () => {
    const peers = meetingEligiblePeerIds(ACTOR, [FRIEND], [
      { senderId: ACTOR, recipientId: POKE_PEER, status: "accepted" },
      { senderId: POKE_PEER, recipientId: ACTOR, status: "pending" },
      { senderId: ACTOR, recipientId: ACTOR, status: "accepted" },
    ]);

    expect(peers).toEqual(new Set([FRIEND, POKE_PEER]));
  });

  it("uses a coarse-cell candidate radius without widening the server reward boundary", () => {
    expect(MEETING_CANDIDATE_RADIUS_KM).toBe(1);
    expect(meetingProximityEligible(1_000)).toBe(true);
    expect(meetingProximityEligible(1_001)).toBe(false);
  });

  it("keeps Poke and Plan authorization server-side with the old anti-farming core", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260908113338_meeting_social_eligibility.sql"),
      "utf8",
    );

    expect(migration).toContain("poke.status = 'accepted'");
    expect(migration).toContain("public.plan_members");
    expect(migration).toContain("plan.starts_at between");
    expect(migration).toContain("public.user_blocks");
    expect(migration).toContain("updated_at > pg_catalog.now() - interval '10 minutes'");
    expect(migration).toContain("if distance_meters > 50 then");
    expect(migration).toContain("insert into public.friend_meetings");
    expect(migration).toContain("for update");
    expect(migration).toContain("'meeting_bonus'");
  });
});
