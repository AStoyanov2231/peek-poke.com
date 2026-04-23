"use client";

import { Sparkles } from "lucide-react";
import { PremiumUpgradeButton } from "@/components/profile/PremiumUpgradeButton";

interface PremiumCardProps {
  isPremiumUser: boolean;
}

export function PremiumCard({ isPremiumUser }: PremiumCardProps) {
  if (isPremiumUser) {
    return (
      <div
        className="rounded-lg p-4 flex items-center gap-3"
        style={{ background: "linear-gradient(135deg, oklch(0.32 0.14 282), oklch(0.18 0.08 282))" }}
      >
        <Sparkles size={20} style={{ color: "oklch(0.85 0.12 282)", flexShrink: 0 }} />
        <div className="flex-1">
          <p className="t-body-b text-white">Peek Premium</p>
          <p className="t-caption" style={{ color: "rgba(255,255,255,0.6)" }}>Active subscription</p>
        </div>
        <PremiumUpgradeButton />
      </div>
    );
  }

  return (
    <div
      className="rounded-lg overflow-hidden relative"
      style={{ background: "linear-gradient(135deg, oklch(0.32 0.14 282), oklch(0.18 0.08 282))" }}
    >
      {/* Decorative blur circle */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-30 pointer-events-none"
        style={{ background: "oklch(0.72 0.17 30)", filter: "blur(24px)" }}
      />
      <div className="relative p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} style={{ color: "oklch(0.85 0.12 282)" }} />
          <span className="t-body-b text-white">Peek Premium</span>
        </div>
        <p className="t-caption" style={{ color: "rgba(255,255,255,0.72)" }}>
          Unlimited friends, see who viewed your profile, priority in search, and more.
        </p>
        <PremiumUpgradeButton />
      </div>
    </div>
  );
}
