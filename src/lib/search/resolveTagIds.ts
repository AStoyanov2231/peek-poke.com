'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { ResolvedTagMap } from './types';

export function useResolveTagIds(rawTagTokens: string[]): {
  resolvedMap: ResolvedTagMap;
  unresolvedTokens: string[];
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['resolve-tags', [...new Set(rawTagTokens)].sort()],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('resolve_interest_tags', {
        names: rawTagTokens,
      });
      if (error) throw error;
      // supabase rpc returns unknown without generated types
      return data as Array<{ id: string; name: string; icon: string | null }>;
    },
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
  }, [data, rawTagTokens]);

  const unresolvedTokens = useMemo(
    () => rawTagTokens.filter((t) => !resolvedMap.has(t.toLowerCase())),
    [data, rawTagTokens],
  );

  return { resolvedMap, unresolvedTokens, isLoading, isError };
}
