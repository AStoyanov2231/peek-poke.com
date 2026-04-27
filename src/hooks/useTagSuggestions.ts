'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { SearchTagResult } from '@/lib/search/types';

export function useTagSuggestions(prefix: string | null): { data: SearchTagResult[]; isLoading: boolean } {
  const supabase = createClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tag-suggestions', prefix],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_interest_tags', { q: prefix });
      if (error) throw error;
      // supabase rpc returns unknown without generated types
      return (data as SearchTagResult[]) ?? [];
    },
    enabled: prefix !== null,
  });

  return {
    data: data ?? [],
    isLoading,
  };
}
