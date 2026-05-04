"use client";

import { useEffect, useState } from "react";

interface MatchCountdownBadgeProps {
  expiresAt: string;
  className?: string;
}

export function MatchCountdownBadge({ expiresAt, className }: MatchCountdownBadgeProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) {
    return <span className={`t-caption text-danger-500 ${className ?? ""}`}>Expired</span>;
  }

  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);

  const display = hours >= 1 ? `${hours}h left` : `${minutes}m left`;

  const colorClass =
    hours > 24 ? "muted" :
    hours >= 8 ? "text-amber-500" :
    "text-danger-500";

  return (
    <span className={`t-caption font-medium ${colorClass} ${className ?? ""}`}>
      {display}
    </span>
  );
}
