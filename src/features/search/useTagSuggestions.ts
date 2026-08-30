'use client';

import { useQuery } from '@tanstack/react-query';
import {
  searchTagRequestSchema,
  searchTagResultsSchemaForLimit,
  type SearchTagResult,
} from '@peekpoke/shared';
import { webQueryKeys } from '@/data/web-query';
import { fetchContract } from '@/lib/typed-api';

export function fetchTagSuggestions(prefix: string, signal?: AbortSignal) {
  return fetchTagSuggestionsRequest({ q: prefix, limit: 20 }, signal);
}

export function fetchTagSuggestionsRequest(request: unknown, signal?: AbortSignal) {
  const query = searchTagRequestSchema.parse(request);
  return fetchContract(
    `/api/search/tags?q=${encodeURIComponent(query.q)}&limit=${query.limit}`,
    searchTagResultsSchemaForLimit(query.limit),
    { signal },
  );
}

export function useTagSuggestions(prefix: string | null): { data: SearchTagResult[]; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: webQueryKeys.tagSuggestions(prefix ?? ''),
    queryFn: ({ signal }) => fetchTagSuggestions(prefix ?? '', signal),
    enabled: prefix !== null,
  });

  return {
    data: data ?? [],
    isLoading,
  };
}
