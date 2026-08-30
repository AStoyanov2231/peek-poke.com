"use client";

import { Check, Eye, ImageIcon, Sparkles, Users } from "lucide-react";
import Link from "next/link";

interface PremiumCardProps {
  isPremiumUser: boolean;
}

const FEATURES = [
  { icon: Users, label: "Unlimited friends" },
  { icon: ImageIcon, label: "See other people's photos" },
  { icon: Eye, label: "See who viewed your profile" },
];

export function PremiumCard({ isPremiumUser }: PremiumCardProps) {
  if (isPremiumUser) {
    return (
      <div
        className="rounded-xl p-4 flex items-center gap-3 border"
        style={{
          background: "linear-gradient(135deg, oklch(0.32 0.14 282), oklch(0.18 0.08 282))",
          borderColor: "oklch(0.45 0.12 282 / 0.5)",
        }}
      >
        <Sparkles size={20} style={{ color: "oklch(0.85 0.12 282)", flexShrink: 0 }} />
        <div className="flex-1">
          <p className="t-body-b text-white">Peek Premium</p>
          <p className="t-caption" style={{ color: "rgba(255,255,255,0.6)" }}>Active subscription</p>
        </div>
        <Link
          href="/premium"
          className="flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: "oklch(0.85 0.12 282)" }}
        >
          Manage
        </Link>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: "linear-gradient(160deg, oklch(0.28 0.16 282), oklch(0.16 0.09 282))",
        borderColor: "oklch(0.45 0.12 282 / 0.5)",
      }}
    >
      <div className="p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Sparkles size={18} style={{ color: "oklch(0.85 0.12 282)" }} />
          <span className="t-body-b text-white">Peek Premium</span>
          <span
            className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: "oklch(0.45 0.12 282 / 0.5)", color: "oklch(0.85 0.12 282)" }}
          >
            Unlock everything
          </span>
        </div>

        {/* CTA */}
        <Link
          href="/premium"
          className="bg-gradient-to-r from-amber-400 to-amber-500 text-white rounded-full px-4 py-2 text-sm font-semibold flex items-center gap-1.5 shadow-e-1 justify-center w-full"
        >
          Upgrade to Premium
        </Link>

        {/* Price */}
        <div>
          <p className="t-caption" style={{ color: "rgba(255,255,255,0.5)" }}>From</p>
          <p className="text-white font-bold text-lg leading-tight">View current price</p>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid oklch(0.45 0.12 282 / 0.35)" }} />

        {/* Features */}
        <div className="flex flex-col gap-2.5">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0"
                style={{ width: 18, height: 18, background: "oklch(0.55 0.16 160 / 0.25)" }}
              >
                <Check size={11} style={{ color: "oklch(0.72 0.18 160)" }} />
              </div>
              <Icon size={14} style={{ color: "oklch(0.78 0.10 282)", flexShrink: 0 }} />
              <span className="t-caption" style={{ color: "rgba(255,255,255,0.85)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
