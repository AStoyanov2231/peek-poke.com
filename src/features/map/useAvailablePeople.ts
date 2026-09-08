"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAvailability } from "@/data/availability";

/** Approximate availability is separate from map coordinates and ignores expired rows. */
export function useAvailablePeople() {
  const query = useQuery({ queryKey: ["web", "availability", "nearby"], queryFn: ({ signal }) => fetchAvailability(signal), staleTime: 30_000, refetchInterval: 30_000 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  return useMemo(() => new Map((query.data?.people ?? [])
    .filter((person) => new Date(person.availability.expiresAt).getTime() > now)
    .map((person) => [person.profile.id, person.availability])), [now, query.data]);
}
