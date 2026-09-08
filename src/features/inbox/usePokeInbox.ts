"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isActivePendingPoke } from "@/data/pokes";
import { pokesQueryOptions } from "@/data/web-query";

/** One cached inbox query powers the Pokes tab and navigation badges. */
export function usePokeInbox() {
  const pokesQuery = useQuery(pokesQueryOptions);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const received =
    pokesQuery.data?.received.filter((poke) =>
      isActivePendingPoke(poke, now),
    ) ?? [];
  const sent =
    pokesQuery.data?.sent.filter((poke) => isActivePendingPoke(poke, now)) ??
    [];
  return { pokesQuery, received, sent, pendingReceivedCount: received.length };
}
