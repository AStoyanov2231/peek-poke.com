import type { CurrentProfile, OwnerProfilePhoto, ProfileInterest, PublicProfileResponse } from "@peekpoke/shared";
import type { Query, QueryClient } from "@tanstack/react-query";
import { nativeQueryKeys } from "@/data/query-keys";

export function mergePhoto(
  photos: OwnerProfilePhoto[],
  changedPhoto: OwnerProfilePhoto
): OwnerProfilePhoto[] {
  return photos.map((photo) => photo.id === changedPhoto.id ? changedPhoto : photo);
}

export function removePhoto(photos: OwnerProfilePhoto[], photoId: string): OwnerProfilePhoto[] {
  return photos.filter((photo) => photo.id !== photoId);
}

export function removeInterest(
  interests: ProfileInterest[],
  interestId: string
): ProfileInterest[] {
  return interests.filter((interest) => interest.id !== interestId);
}

export function commitNativeOwnerProfileUpdate(
  queryClient: QueryClient,
  ownerId: string,
  profile: CurrentProfile,
) {
  const current = queryClient.getQueryData<CurrentProfile | null>(nativeQueryKeys.profile.current);
  if (current?.id !== ownerId || profile.id !== ownerId) return false;

  queryClient.setQueryData(nativeQueryKeys.profile.current, profile);
  queryClient.setQueryData<PublicProfileResponse>(
    nativeQueryKeys.profile.public(ownerId),
    (cached) => cached
      ? { ...cached, profile: { ...cached.profile, display_name: profile.display_name, bio: profile.bio } }
      : cached,
  );
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordId(value: unknown, key: "id" | "userId" = "id") {
  return isRecord(value) && typeof value[key] === "string" ? value[key] : null;
}

function arrayField(value: unknown, key: string) {
  if (!isRecord(value)) return [];
  const field = value[key];
  return Array.isArray(field) ? field : [];
}

function friendshipReferencesProfile(value: unknown, profileId: string) {
  return isRecord(value)
    && (
      value.requester_id === profileId
      || value.addressee_id === profileId
      || recordId(value.requester) === profileId
      || recordId(value.addressee) === profileId
    );
}

export function nativeQueryContainsProfileReference(
  query: Pick<Query, "queryKey" | "state">,
  viewerId: string,
  profileId: string,
) {
  const key = query.queryKey;
  const data = query.state.data;

  if (key.length === nativeQueryKeys.profile.current.length && key[0] === "profile" && key[1] === "current") {
    return viewerId === profileId && recordId(data) === profileId;
  }
  if (key.length === 3 && key[0] === "profile" && key[1] === "public") {
    return key[2] === profileId;
  }
  if (
    key[0] === nativeQueryKeys.social.friends[0]
    && (key[1] === "friends" || key[1] === "requests")
  ) {
    const values = Array.isArray(data)
      ? data
      : [
        ...arrayField(data, "friends"),
        ...arrayField(data, "requests"),
        ...arrayField(data, "sentRequests"),
      ];
    return values.some((value) => friendshipReferencesProfile(value, profileId));
  }
  if (key[0] === "inbox" && key[1] === "threads") {
    return arrayField(data, "threads").some((thread) => {
      return isRecord(thread)
        && (
          recordId(thread.participant_1) === profileId
          || recordId(thread.participant_2) === profileId
          || thread.participant_1_id === profileId
          || thread.participant_2_id === profileId
        );
    });
  }
  if (key[0] === "discovery" && key[1] === "search" && key[2] === "users") {
    return Array.isArray(data) && data.some((user) => recordId(user) === profileId);
  }
  return false;
}

export function isNativeProfileRecoveryQuery(query: Pick<Query, "queryKey">) {
  const key = query.queryKey;
  return (
    (key[0] === "profile" && (key[1] === "current" || key[1] === "public"))
    || (key[0] === "social" && (key[1] === "friends" || key[1] === "requests"))
    || (key[0] === "inbox" && key[1] === "threads")
    || (key[0] === "discovery" && key[1] === "search" && key[2] === "users")
  );
}

export async function refreshActiveNativeProfileQueries(
  queryClient: QueryClient,
  viewerId: string,
  signal?: AbortSignal,
) {
  const isCurrentViewer = () =>
    queryClient.getQueryData<CurrentProfile | null>(nativeQueryKeys.profile.current)?.id === viewerId;
  if (signal?.aborted || !isCurrentViewer()) return false;
  await queryClient.refetchQueries({
    predicate: isNativeProfileRecoveryQuery,
    type: "active",
  });
  return !signal?.aborted && isCurrentViewer();
}

export async function refreshNativeProfileReferences(
  queryClient: QueryClient,
  viewerId: string,
  profileId: string,
  options: { signal?: AbortSignal; refetch?: boolean } = {},
) {
  const isCurrentViewer = () =>
    queryClient.getQueryData<CurrentProfile | null>(nativeQueryKeys.profile.current)?.id === viewerId;
  const predicate = (query: Query) =>
    nativeQueryContainsProfileReference(query, viewerId, profileId);
  if (options.signal?.aborted || !isCurrentViewer()) return false;

  await queryClient.invalidateQueries({ predicate, refetchType: "none" });
  if (options.signal?.aborted || !isCurrentViewer()) return false;
  if (options.refetch !== false) {
    await queryClient.refetchQueries({ predicate, type: "active" });
  }
  return !options.signal?.aborted && isCurrentViewer();
}

export async function refreshNativeOwnerProfileReferences(
  queryClient: QueryClient,
  ownerId: string,
  signal?: AbortSignal,
) {
  return refreshNativeProfileReferences(queryClient, ownerId, ownerId, { signal });
}
