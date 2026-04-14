"use client";

import { useCoins } from "@/stores/selectors";

export function CoinBalance() {
  const coins = useCoins();

  return (
    <div className="flex items-center gap-1 h-7 px-2 rounded-full bg-background shadow-neu-raised-sm select-none">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        className="text-amber-500"
      >
        <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fill="currentColor"
          fontSize="12"
          fontWeight="bold"
        >
          C
        </text>
      </svg>
      <span className="text-xs font-semibold text-foreground tabular-nums">
        {coins}/5
      </span>
    </div>
  );
}
