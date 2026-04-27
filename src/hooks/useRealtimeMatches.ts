"use client";
import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const MATCHES_REFETCH_DEBOUNCE_MS = 1000;

interface UseRealtimeMatchesParams {
  fetchMatches: () => Promise<void>;
  isPreloading: boolean;
}

export function useRealtimeMatches({
  fetchMatches,
  isPreloading,
}: UseRealtimeMatchesParams) {
  const isSetupRef = useRef<boolean>(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchMatches();
    }, MATCHES_REFETCH_DEBOUNCE_MS);
  }, [fetchMatches]);

  useEffect(() => {
    if (isPreloading) return;
    if (isSetupRef.current) return;
    isSetupRef.current = true;

    let isMounted = true;

    const matchesChannel = supabase
      .channel("global-matches")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => {
          if (!isMounted) return;
          debouncedFetch();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      isSetupRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(matchesChannel);
    };
  }, [isPreloading, debouncedFetch]);
}
