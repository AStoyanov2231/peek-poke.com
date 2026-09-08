"use client";

import { Clock3 } from "lucide-react";

export function PremiumUpgradeButton({ fullWidth }: { fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? "w-full" : undefined}>
      <button type="button" disabled aria-describedby="peek-plus-unavailable" className={`btn btn-secondary btn-lg cursor-not-allowed opacity-70${fullWidth ? " btn-block" : ""}`}>
        <Clock3 size={17} />Peek+ is coming soon
      </button>
      <p id="peek-plus-unavailable" className="mt-2 t-caption text-center text-ink-5">New subscriptions are not available while we finish these optional extras.</p>
    </div>
  );
}
