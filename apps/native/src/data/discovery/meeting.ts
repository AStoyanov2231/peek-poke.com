import { MEETING_CANDIDATE_RADIUS_KM, type NearbyUser } from "@peekpoke/shared";
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
  return active && hasFreshLocation && hasProfile && friendCount > 0 && nearbyCount > 0;
}

export function meetingCandidateIds(
  location: Coordinates,
  nearbyUsers: NearbyUser[],
  friendIds: ReadonlySet<string>,
  metFriendIds: ReadonlySet<string>,
  attemptedFriendIds: ReadonlySet<string>,
) {
  return nearbyUsers.flatMap((nearby) => {
      if (!friendIds.has(nearby.userId)) return [];
      if (metFriendIds.has(nearby.userId)) return [];
      if (attemptedFriendIds.has(nearby.userId)) return [];
      return haversineKm(location.lat, location.lng, nearby.lat, nearby.lng) <= MEETING_RADIUS_KM
        ? [nearby.userId]
        : [];
    });
}
