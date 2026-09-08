"use client";

import { Heart, Sparkles } from "lucide-react";
import { ManageSubscriptionButton } from "@/features/profile/components/ManageSubscriptionButton";
import { PremiumUpgradeButton } from "@/features/profile/components/PremiumUpgradeButton";
import { useIsPremium } from "@/stores/selectors";

const FUTURE_EXTRAS = [
  "A little more control over discovery",
  "A few thoughtful profile touches",
  "Optional ways to highlight a plan",
];

export default function PremiumPage() {
  const premium = useIsPremium();

  return (
    <div className="h-full overflow-y-auto bg-background">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <header className="flex flex-col gap-2">
          <h1 className="t-title-1 text-[var(--ink-9)]">Peek+</h1>
          <p className="t-caption text-[var(--ink-5)]">Optional extras, when they are ready.</p>
        </header>

        <section
          aria-label="Peek+"
          className="flex flex-col gap-5 rounded-[var(--r-lg)] border p-5 text-white"
          style={{
            background: "linear-gradient(145deg, oklch(0.31 0.1 35), oklch(0.18 0.045 30))",
            borderColor: "oklch(0.54 0.14 35 / 0.45)",
          }}
        >
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden="true" size={21} className="text-[oklch(0.82_0.11_55)]" />
            <p className="t-body-b">Peek+</p>
            <span className="ml-auto rounded-full bg-white/15 px-2 py-1 t-caption font-bold text-[oklch(0.9_0.06_65)]">
              {premium ? "Active" : "Coming soon"}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <p className="t-body-b">The social essentials stay free.</p>
            <p className="t-caption text-white/70">Pokes, messages, plans, and meeting up are available to everyone.</p>
          </div>

          {premium ? (
            <div className="flex flex-col gap-2">
              <ManageSubscriptionButton fullWidth />
            </div>
          ) : (
            <PremiumUpgradeButton fullWidth />
          )}

          <div className="border-t border-white/15 pt-4">
            <p className="t-caption font-semibold text-white/80">What we are considering</p>
            <ul className="mt-3 flex flex-col gap-2.5" aria-label="Potential future Peek+ extras">
              {FUTURE_EXTRAS.map((extra) => (
                <li key={extra} className="flex items-start gap-2.5 t-caption text-white/80">
                  <Heart aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-[oklch(0.78_0.13_35)]" />
                  {extra}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <p className="t-caption text-center text-[var(--ink-5)]">
          {premium
            ? "You can manage your existing subscription above."
            : "New subscriptions are not available yet, and no payment details are collected here."}
        </p>
      </main>
    </div>
  );
}
