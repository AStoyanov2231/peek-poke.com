"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";

interface PremiumCardProps {
  isPremiumUser: boolean;
}

export function PremiumCard({ isPremiumUser }: PremiumCardProps) {
  return (
    <div
      className="overflow-hidden rounded-xl border p-4"
      style={{
        background: "linear-gradient(145deg, oklch(0.31 0.1 35), oklch(0.18 0.045 30))",
        borderColor: "oklch(0.54 0.14 35 / 0.45)",
      }}
    >
      <div className="flex items-center gap-3">
        <Sparkles aria-hidden="true" size={20} className="shrink-0 text-[oklch(0.82_0.11_55)]" />
        <div className="min-w-0 flex-1">
          <p className="t-body-b text-white">Peek+</p>
          <p className="t-caption text-white/65">
            {isPremiumUser ? "Active subscription" : "Optional extras, when they are ready"}
          </p>
        </div>
        <Link href="/premium" className="shrink-0 text-sm font-semibold text-[oklch(0.88_0.08_60)]">
          {isPremiumUser ? "Manage" : "Details"}
        </Link>
      </div>
    </div>
  );
}
