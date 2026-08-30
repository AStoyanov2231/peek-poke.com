import { queryOptions } from "@tanstack/react-query";
import { nativeQueryKeys } from "@/data/query-keys";
import {
  fetchPublicProfile,
  fetchTagSuggestions,
  resolveTags,
  searchUsers,
} from "./api";

export const discoveryQueryKeys = {
  tags: (prefix: string) => ["discovery", "search", "tags", prefix] as const,
  resolvedTags: (names: string[]) => ["discovery", "search", "resolved-tags", ...names] as const,
  users: (nameQuery: string, tagIds: string[], nearbyIds: string[]) =>
    [...nativeQueryKeys.discovery.userSearch, nameQuery, ...tagIds, "|", ...nearbyIds] as const,
} as const;

export function tagSuggestionsQueryOptions(prefix: string) {
  return queryOptions({
    queryKey: discoveryQueryKeys.tags(prefix),
    queryFn: ({ signal }) => fetchTagSuggestions(prefix, signal),
  });
}

export function resolvedTagsQueryOptions(names: string[]) {
  return queryOptions({
    queryKey: discoveryQueryKeys.resolvedTags(names),
    queryFn: ({ signal }) => resolveTags(names, signal),
    staleTime: 5 * 60_000,
  });
}

export function userSearchQueryOptions(
  nameQuery: string,
  tagIds: string[],
  nearbyIds: string[],
) {
  return queryOptions({
    queryKey: discoveryQueryKeys.users(nameQuery, tagIds, nearbyIds),
    queryFn: ({ signal }) => searchUsers(nameQuery, tagIds, nearbyIds, signal),
    staleTime: 30_000,
  });
}

export function publicProfileQueryOptions(userId: string) {
  return queryOptions({
    queryKey: nativeQueryKeys.profile.public(userId),
    queryFn: ({ signal }) => fetchPublicProfile(userId, signal),
    staleTime: 30_000,
  });
}
