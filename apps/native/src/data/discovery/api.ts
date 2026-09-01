import type {
  AdminBot,
  AdminBotCollectResult,
  LocationUpdateResponse,
  NearbyResponse,
  NearbyUser,
  PublicProfileResponse,
  ResolvedTag,
  SearchTagResult,
  SearchUserResult,
} from "@peekpoke/shared";
import {
  adminBotCollectRequestSchema,
  adminBotCollectResultSchema,
  adminBotListResponseSchema,
  locationAttestationResponseSchema,
  locationUpdateResponseSchema,
  nearbyResponseSchemaForViewer,
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

export type Coordinates = { lat: number; lng: number };
export type Bot = AdminBot;
export type PublicProfileData = PublicProfileResponse;

export const LOCATION_UPDATE_TIMEOUT_MS = 8_000;

export function updateLocation(
  coords: Coordinates,
  signal?: AbortSignal,
): Promise<LocationUpdateResponse> {
  return apiFetch<{ token: string }>("/api/location/attestation", {
    method: "POST",
    body: jsonBody(coords),
    signal,
    timeoutMs: LOCATION_UPDATE_TIMEOUT_MS,
    responseSchema: locationAttestationResponseSchema,
  }).then(({ token }) => apiFetch<LocationUpdateResponse>("/api/location", {
    method: "POST",
    body: jsonBody(coords),
    signal,
    timeoutMs: LOCATION_UPDATE_TIMEOUT_MS,
    headers: { "x-location-attestation": token },
    responseSchema: locationUpdateResponseSchema,
  }));
}

export async function fetchNearby(
  coords: Coordinates,
  viewerId: string,
  signal?: AbortSignal,
): Promise<NearbyUser[]> {
  const response = await apiFetch<NearbyResponse>("/api/nearby", {
    method: "POST",
    body: jsonBody(coords),
    signal,
    responseSchema: nearbyResponseSchemaForViewer(viewerId, env.supabaseUrl),
  });
  return response.users;
}

export function fetchBots(coords: Coordinates, signal?: AbortSignal) {
  return apiFetch<Bot[]>(
    `/api/bots?lat=${encodeURIComponent(coords.lat)}&lng=${encodeURIComponent(coords.lng)}`,
    { signal, responseSchema: adminBotListResponseSchema },
  );
}

export function collectBot(botId: string, coords: Coordinates) {
  const body = adminBotCollectRequestSchema.parse({ id: botId, ...coords });
  return apiFetch<AdminBotCollectResult>("/api/bots", {
    method: "POST",
    body: jsonBody(body),
    responseSchema: adminBotCollectResultSchema,
  });
}

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
  return apiFetch<PublicProfileData>(`/api/profile/${encodeURIComponent(userId)}?limit=100`, {
    signal,
    responseSchema: publicProfileResponseSchemaForTarget(userId, env.supabaseUrl),
  });
}
