"use client";

import { useEffect, useState } from "react";
import { isAvailabilityCurrent, type Availability } from "@peekpoke/shared";

/**
 * The UI must stop displaying an expired invitation even if its no-store
 * refresh is offline or fails. The refresh only reconciles the rest of context.
 */
export function useExpiringAvailability(
  rawAvailability: Availability | null,
  refresh: () => Promise<unknown>,
) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!rawAvailability) return;
    const delay = Math.max(0, Date.parse(rawAvailability.expiresAt) - Date.now()) + 50;
    const timer = window.setTimeout(() => {
      setNowMs(Date.now());
      void refresh().catch(() => undefined);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [rawAvailability, refresh]);
  // nowMs changes at expiry so React rerenders even while the network is offline.
  return isAvailabilityCurrent(rawAvailability, nowMs) ? rawAvailability : null;
}
