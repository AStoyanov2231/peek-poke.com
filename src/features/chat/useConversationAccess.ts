"use client";

import { useEffect, useReducer } from "react";
import { useQuery } from "@tanstack/react-query";
import { conversationWindowRemainingMs, dmConversationAccessSchemaFor } from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

export function useConversationAccess(threadId: string, accountId: string | undefined) {
  const query = useQuery({
    queryKey: ["conversation-access", accountId, threadId],
    enabled: Boolean(accountId && threadId),
    queryFn: async ({ signal }) => {
      // Count network time against the window, never as extra permission.
      const measuredAt = performance.now();
      const access = await fetchContract(`/api/dm/${encodeURIComponent(threadId)}/access`,
        dmConversationAccessSchemaFor(threadId, accountId!), { signal, cache: "no-store" });
      return { access, measuredAt, receivedAt: performance.now() };
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    gcTime: 0,
    retry: false,
    refetchInterval: 30_000,
  });
  const [sampledAt, sampleClock] = useReducer((_: number, sample: number) => sample, 0);
  useEffect(() => {
    if (query.data?.access.basis !== "poke") return;
    const tick = () => sampleClock(performance.now());
    const timer = setInterval(tick, 1_000);
    const remaining = conversationWindowRemainingMs(query.data.access, performance.now() - query.data.measuredAt)!;
    const deadline = setTimeout(tick, Math.min(remaining, 2_147_483_647));
    return () => { clearInterval(timer); clearTimeout(deadline); };
  }, [query.data]);
  const remaining = query.data
    ? conversationWindowRemainingMs(query.data.access, Math.max(sampledAt, query.data.receivedAt) - query.data.measuredAt)
    : undefined;
  return {
    ...query,
    expired: remaining === 0,
    canInteract: Boolean(accountId && query.data && !query.isError && remaining !== 0),
  };
}
