import { useCallback, useEffect, useReducer } from "react";
import { useQuery } from "@tanstack/react-query";
import { conversationWindowRemainingMs, dmConversationAccessSchemaFor, type DmConversationAccess } from "@peekpoke/shared";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { apiFetch } from "@/lib/api";

export function useConversationAccess(threadId: string, accountId: string | undefined) {
  const query = useQuery({
    queryKey: ["conversation-access", accountId, threadId],
    enabled: Boolean(accountId && threadId),
    queryFn: async ({ signal }) => {
      // Count network time against the window, never as extra permission.
      const measuredAt = performance.now();
      const access = await apiFetch<DmConversationAccess>(`/api/dm/${encodeURIComponent(threadId)}/access`,
        { responseSchema: dmConversationAccessSchemaFor(threadId, accountId!), signal, cache: "no-store" });
      return { access, measuredAt, receivedAt: performance.now() };
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: 30_000,
  });
  const { refetch } = query;
  useFocusEffect(useCallback(() => {
    if (!accountId) return;
    void refetch();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refetch();
    });
    return () => listener.remove();
  }, [accountId, refetch]));
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
