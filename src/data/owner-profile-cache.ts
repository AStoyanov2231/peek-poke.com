import type { Query, QueryClient } from "@tanstack/react-query";
import {
  profileUpdatedHintSchema,
  type CurrentProfile,
  type PublicProfileResponse,
} from "@peekpoke/shared";
import { webQueryKeys } from "./web-query";

export function commitWebOwnerProfileUpdate(
  queryClient: QueryClient,
  ownerId: string,
  profile: CurrentProfile,
) {
  const current = queryClient.getQueryData<CurrentProfile | null>(webQueryKeys.profile);
  if (current?.id !== ownerId || profile.id !== ownerId) return false;

  queryClient.setQueryData(webQueryKeys.profile, profile);
  queryClient.setQueryData<PublicProfileResponse>(
    webQueryKeys.publicProfile(ownerId),
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

export function webQueryContainsProfileReference(
  query: Pick<Query, "queryKey" | "state">,
  viewerId: string,
  profileId: string,
) {
  const key = query.queryKey;
  const data = query.state.data;

  if (key.length === webQueryKeys.profile.length && key[0] === "web" && key[1] === "profile") {
    return viewerId === profileId && recordId(data) === profileId;
  }
  if (key.length === 3 && key[0] === "web" && key[1] === "profile") {
    return key[2] === profileId;
  }
  if (key.length === webQueryKeys.friends.length && key[0] === "web" && key[1] === "friends") {
    return arrayField(data, "friends").some((friend) => recordId(friend) === profileId)
      || arrayField(data, "requests").some((request) => {
        return isRecord(request) && recordId(request.requester) === profileId;
      })
      || arrayField(data, "sentRequests").some((request) => {
        return isRecord(request) && recordId(request.addressee) === profileId;
      });
  }
  if (key.length === webQueryKeys.threads.length && key[0] === "web" && key[1] === "threads") {
    return arrayField(data, "threads").some((thread) => {
      return isRecord(thread)
        && (
          recordId(thread.participant_1) === profileId
          || recordId(thread.participant_2) === profileId
        );
    });
  }
  if (key[0] === "web" && key[1] === "nearby") {
    return Array.isArray(data) && data.some((user) => recordId(user, "userId") === profileId);
  }
  if (key[0] === "web" && key[1] === "search" && key[2] === "users") {
    return Array.isArray(data) && data.some((user) => recordId(user) === profileId);
  }
  return false;
}

export function isWebProfileRecoveryQuery(query: Pick<Query, "queryKey">) {
  const key = query.queryKey;
  const isPublicProfile = key[0] === "web"
    && key[1] === "profile"
    && key.length === 3
    && profileUpdatedHintSchema.safeParse({ profile_id: key[2] }).success;
  return (
    (key[0] === "web" && key[1] === "profile" && key.length === 2)
    || isPublicProfile
    || (key[0] === "web" && key[1] === "friends")
    || (key[0] === "web" && key[1] === "threads" && key.length === 2)
    || (key[0] === "web" && key[1] === "nearby")
    || (key[0] === "web" && key[1] === "search" && key[2] === "users")
  );
}

export async function refreshActiveWebProfileQueries(
  queryClient: QueryClient,
  signal?: AbortSignal,
) {
  if (signal?.aborted) return false;
  await queryClient.refetchQueries({
    predicate: isWebProfileRecoveryQuery,
    type: "active",
  });
  return !signal?.aborted;
}

export async function refreshWebProfileReferences(
  queryClient: QueryClient,
  viewerId: string,
  profileId: string,
  options: { signal?: AbortSignal; refetch?: boolean } = {},
) {
  const predicate = (query: Query) =>
    webQueryContainsProfileReference(query, viewerId, profileId);
  if (options.signal?.aborted) return false;

  await queryClient.invalidateQueries({ predicate, refetchType: "none" });
  if (options.signal?.aborted || options.refetch === false) return !options.signal?.aborted;
  await queryClient.refetchQueries({ predicate, type: "active" });
  return !options.signal?.aborted;
}

export async function refreshWebOwnerProfileReferences(
  queryClient: QueryClient,
  ownerId: string,
) {
  return refreshWebProfileReferences(queryClient, ownerId, ownerId);
}
