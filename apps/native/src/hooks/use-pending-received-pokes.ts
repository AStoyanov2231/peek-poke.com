import { useEffect, useMemo, useState } from "react";
import type { PokeInboxItem } from "@peekpoke/shared";

export function pendingPokes(
  pokes: readonly PokeInboxItem[],
  nowMs = Date.now(),
) {
  return pokes.filter((poke) => poke.status === "pending" && Date.parse(poke.expiresAt) > nowMs);
}

export function pendingReceivedPokes(
  pokes: readonly PokeInboxItem[],
  nowMs = Date.now(),
) {
  return pendingPokes(pokes, nowMs);
}

/**
 * Derives offline-safe pending state from cached Pokes. It never polls: one
 * timer advances the view at the earliest cached Poke expiry.
 */
export function usePendingPokes(pokes: readonly PokeInboxItem[]) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pending = useMemo(() => pendingPokes(pokes, nowMs), [nowMs, pokes]);

  useEffect(() => {
    const nextExpiry = pending.reduce<number | null>((soonest, poke) => {
      const expiresAt = Date.parse(poke.expiresAt);
      return soonest === null || expiresAt < soonest ? expiresAt : soonest;
    }, null);
    if (nextExpiry === null) return;
    const timer = setTimeout(() => setNowMs(Date.now()), Math.max(0, nextExpiry - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [pending]);

  return pending;
}

export function usePendingReceivedPokes(pokes: readonly PokeInboxItem[]) {
  return usePendingPokes(pokes);
}
