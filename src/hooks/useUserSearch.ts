'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { SearchUserResult } from '@/lib/search/types';

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

export function useUserSearch(params: UseUserSearchParams): UseUserSearchResult {
  const supabase = createClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'user-search',
      params.nameQuery,
      [...params.tagIds].sort(),
      [...params.nearbyIds].sort(),
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_users', {
        q: params.nameQuery,
        tag_ids: params.tagIds,
        nearby_ids: params.nearbyIds,
      });
      if (error) throw error;
      // supabase rpc returns unknown without generated types
      return (data as SearchUserResult[]) ?? [];
    },
    enabled: params.nameQuery !== '' || params.tagIds.length > 0,
    staleTime: 30 * 1000,
  });

  const results = data ?? [];
  const nearby = results.filter((u) => u.is_nearby);
  const others = results.filter((u) => !u.is_nearby);

  return { nearby, others, isLoading, isError };
}
