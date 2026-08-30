import type {
  PublicProfileResponse,
  ResolvedTag,
  SearchTagResult,
  SearchUserResult,
} from "@peekpoke/shared";
import {
  publicProfileResponseSchemaForTarget,
  resolvedTagsSchemaForRequest,
  normalizeUserSearchQuery,
  resolveTagsRequestSchema,
  searchTagRequestSchema,
  searchTagResultsSchemaForLimit,
  searchUserResultsSchemaForLimit,
  userSearchQuerySchema,
  userSearchRequestSchema,
} from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";
import { env } from "@/lib/env";

export type PublicProfileData = PublicProfileResponse;


export function fetchTagSuggestions(prefix: string, signal?: AbortSignal) {
  return fetchTagSuggestionsRequest({ q: prefix, limit: 20 }, signal);
}

export function fetchTagSuggestionsRequest(request: unknown, signal?: AbortSignal) {
  const query = searchTagRequestSchema.parse(request);
  return apiFetch<SearchTagResult[]>(
    `/api/search/tags?q=${encodeURIComponent(query.q)}&limit=${query.limit}`,
    { signal, responseSchema: searchTagResultsSchemaForLimit(query.limit) },
  );
}

export function resolveTags(names: string[], signal?: AbortSignal) {
  return resolveTagsRequest({ names }, signal);
}

export function resolveTagsRequest(request: unknown, signal?: AbortSignal) {
  const body = resolveTagsRequestSchema.parse(request);
  return apiFetch<ResolvedTag[]>("/api/search/tags/resolve", {
    method: "POST",
    body: jsonBody(body),
    signal,
    responseSchema: resolvedTagsSchemaForRequest(body.names),
  });
}

export function searchUsers(
  nameQuery: string,
  tagIds: string[],
  nearbyIds: string[],
  signal?: AbortSignal,
) {
  return searchUsersRequest({
    q: nameQuery,
    tag_ids: tagIds,
    nearby_ids: nearbyIds,
  }, signal);
}

export function searchUsersRequest(request: unknown, signal?: AbortSignal) {
  return searchUsersPageRequest(request, { limit: 50 }, signal);
}

export function searchUsersPageRequest(
  request: unknown,
  queryRequest: unknown,
  signal?: AbortSignal,
) {
  const body = userSearchRequestSchema.parse(request);
  const query = userSearchQuerySchema.parse(normalizeUserSearchQuery(queryRequest));
  const searchParams = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) searchParams.set("cursor", query.cursor);
  return apiFetch<SearchUserResult[]>(`/api/search/users?${searchParams}`, {
    method: "POST",
    body: jsonBody(body),
    signal,
    responseSchema: searchUserResultsSchemaForLimit(query.limit),
  });
}

export function fetchPublicProfile(userId: string, signal?: AbortSignal) {
  return apiFetch<PublicProfileData>(`/api/profile/${encodeURIComponent(userId)}?limit=100&surface=rooms`, {
    signal,
    responseSchema: publicProfileResponseSchemaForTarget(userId, env.supabaseUrl),
  });
}
