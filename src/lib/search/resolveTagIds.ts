'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  resolvedTagsSchemaForRequest,
  resolveTagsRequestSchema,
  type ResolvedTagMap,
} from '@peekpoke/shared';
import { fetchContract } from '@/lib/typed-api';

export function fetchResolvedTags(rawTagTokens: string[], signal?: AbortSignal) {
  return fetchResolvedTagsRequest({ names: rawTagTokens }, signal);
}

export function fetchResolvedTagsRequest(request: unknown, signal?: AbortSignal) {
  const body = resolveTagsRequestSchema.parse(request);
  return fetchContract('/api/search/tags/resolve', resolvedTagsSchemaForRequest(body.names), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export function useResolveTagIds(rawTagTokens: string[]): {
  resolvedMap: ResolvedTagMap;
  unresolvedTokens: string[];
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['resolve-tags', [...new Set(rawTagTokens)].sort()],
    queryFn: ({ signal }) => fetchResolvedTags(rawTagTokens, signal),
    enabled: rawTagTokens.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const resolvedMap = useMemo<ResolvedTagMap>(() => {
    const map: ResolvedTagMap = new Map();
    if (data) {
      for (const row of data) {
        map.set(row.name.toLowerCase(), { id: row.id, name: row.name, icon: row.icon });
      }
    }
    return map;
  }, [data]);

  const unresolvedTokens = useMemo(
    () => rawTagTokens.filter((t) => !resolvedMap.has(t.toLowerCase())),
    [rawTagTokens, resolvedMap],
  );

  return { resolvedMap, unresolvedTokens, isLoading, isError };
}
