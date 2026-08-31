"use client";

import { useEffect, useRef, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createWebQueryClient } from "@/data/web-query-client";
import { createClient } from "@/lib/supabase/client";
import { shouldClearQueryCacheForAuthChange } from "@/data/query-auth-boundary";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createWebQueryClient);
  const ownerId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let authEventObserved = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      authEventObserved = true;
      const nextOwnerId = session?.user.id ?? null;
      if (shouldClearQueryCacheForAuthChange(ownerId.current, nextOwnerId)) {
        queryClient.clear();
      }
      ownerId.current = nextOwnerId;
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!active || authEventObserved) return;
      ownerId.current = data.session?.user.id ?? null;
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
