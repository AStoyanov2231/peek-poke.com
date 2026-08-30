'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  searchUserResultsSchemaForLimit,
  normalizeUserSearchQuery,
  userSearchQuerySchema,
  userSearchRequestSchema,
  type SearchUserResult,
} from '@peekpoke/shared';
import { webQueryKeys } from '@/data/web-query';
import { fetchContract } from '@/lib/typed-api';

interface UseUserSearchParams {
  nameQuery: string;
  tagIds: string[];
  nearbyIds: string[];
}

interface UseUserSearchResult {
  nearby: SearchUserResult[];
  others: SearchUserResult[];
  isLoading: boolean;
  isError: boolean;
}

export function fetchUserSearch(params: UseUserSearchParams, signal?: AbortSignal) {
  return fetchUserSearchRequest({
    q: params.nameQuery,
    tag_ids: params.tagIds,
    nearby_ids: params.nearbyIds,
  }, signal);
}

export function fetchUserSearchRequest(request: unknown, signal?: AbortSignal) {
  return fetchUserSearchPageRequest(request, { limit: 50 }, signal);
}

export function fetchUserSearchPageRequest(
  request: unknown,
  queryRequest: unknown,
  signal?: AbortSignal,
) {
  const body = userSearchRequestSchema.parse(request);
  const query = userSearchQuerySchema.parse(normalizeUserSearchQuery(queryRequest));
  const searchParams = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) searchParams.set('cursor', query.cursor);
  return fetchContract(`/api/search/users?${searchParams}`, searchUserResultsSchemaForLimit(query.limit), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export function useUserSearch(params: UseUserSearchParams): UseUserSearchResult {
  const { data, isLoading, isError } = useQuery(userSearchProfileQueryOptions(params));

  const results = data ?? [];
  const nearby = results.filter((u) => u.is_nearby);
  const others = results.filter((u) => !u.is_nearby);

  return { nearby, others, isLoading, isError };
}

export function userSearchProfileQueryOptions(params: UseUserSearchParams) {
  return queryOptions({
    queryKey: webQueryKeys.userSearch(params.nameQuery, params.tagIds, params.nearbyIds),
    queryFn: ({ signal }) => fetchUserSearch(params, signal),
    enabled: params.nameQuery !== '' || params.tagIds.length > 0,
    staleTime: 30 * 1000,
  });
}
