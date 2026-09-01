import type { NearbyUser } from "@peekpoke/shared";

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
  nearbyUsers: NearbyUser[],
  friendIds: ReadonlySet<string>,
  metFriendIds: ReadonlySet<string>,
  attemptedFriendIds: ReadonlySet<string>,
) {
  return nearbyUsers.flatMap((nearby) => {
      if (!friendIds.has(nearby.userId)) return [];
      if (metFriendIds.has(nearby.userId)) return [];
      if (attemptedFriendIds.has(nearby.userId)) return [];
      return nearby.meeting_eligible === true ? [nearby.userId] : [];
    });
}
