import { canAttemptMeetingReward, MEETING_CANDIDATE_RADIUS_KM, type NearbyUser } from "@peekpoke/shared";
import { haversineKm } from "@/lib/format";
import type { Coordinates } from "./api";

export const MEETING_RADIUS_KM = MEETING_CANDIDATE_RADIUS_KM;

export function shouldDetectMeetings({
  active,
  hasFreshLocation,
  hasProfile,
  friendCount,
  nearbyCount,
}: {
  active: boolean;
  hasFreshLocation: boolean;
  hasProfile: boolean;
  friendCount: number;
  nearbyCount: number;
}) {
  return canAttemptMeetingReward()
    && active && hasFreshLocation && hasProfile && friendCount > 0 && nearbyCount > 0;
}

export function meetingCandidateIds(
  location: Coordinates,
  nearbyUsers: NearbyUser[],
  eligiblePeerIds: ReadonlySet<string>,
  completedPeerIds: ReadonlySet<string>,
  attemptedPeerIds: ReadonlySet<string>,
) {
  return nearbyUsers.flatMap((nearby) => {
      if (!eligiblePeerIds.has(nearby.userId)) return [];
      if (completedPeerIds.has(nearby.userId)) return [];
      if (attemptedPeerIds.has(nearby.userId)) return [];
      return haversineKm(location.lat, location.lng, nearby.lat, nearby.lng) <= MEETING_RADIUS_KM
        ? [nearby.userId]
        : [];
    });
}
