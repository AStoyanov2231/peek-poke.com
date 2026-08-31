"use client";

import { Check, Eye, ImageIcon, Sparkles, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ManageSubscriptionButton } from "@/features/profile/components/ManageSubscriptionButton";
import { PremiumUpgradeButton } from "@/features/profile/components/PremiumUpgradeButton";
import { useIsPremium, useProfile } from "@/stores/selectors";
import { webQueryKeys } from "@/data/web-query";
import type { RoleName } from "@/types/database";

const FEATURES = [
  { icon: Users, label: "Unlimited friends" },
  { icon: ImageIcon, label: "See other people's photos" },
  { icon: Eye, label: "See who viewed your profile" },
];

async function syncBillingEntitlement(
  updateRoles: (roles: RoleName[]) => void,
  signal: AbortSignal,
) {
  for (let attempt = 0; attempt < 10 && !signal.aborted; attempt += 1) {
    const response = await fetch("/api/billing/entitlements", { cache: "no-store", signal });
    if (response.ok) {
      const data = (await response.json()) as { subscriber: boolean; roles: RoleName[] };
      if (data.subscriber) {
        updateRoles(data.roles);
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

export default function PremiumPage() {
  const queryClient = useQueryClient();
  const premium = useIsPremium();
  const profile = useProfile();
  const [price, setPrice] = useState<{ amount: number; currency: string; interval: string | null } | null>(null);

  // Entitlements are fetched for the mounted billing page and cancelled on unmount.
  // react-doctor-disable-next-line no-fetch-in-effect
  const syncEntitlement = useCallback((signal: AbortSignal) =>
    syncBillingEntitlement((roles) => {
      queryClient.setQueryData(webQueryKeys.bootstrap, (current: { roles: RoleName[] } | undefined) =>
        current ? { ...current, roles } : current,
      );
      queryClient.setQueryData(webQueryKeys.profile, (current: NonNullable<typeof profile> | null | undefined) =>
        current ? { ...current, roles } : current,
      );
    }, signal), [queryClient]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/stripe/price", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ amount: number; currency: string; interval: string | null }>;
      })
      .then(setPrice)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (premium || !profile || new URLSearchParams(window.location.search).get("payment") !== "success") {
      return;
    }

    const controller = new AbortController();
    void syncEntitlement(controller.signal).then(() => {
      if (!controller.signal.aborted) window.history.replaceState(null, "", "/premium");
    }).catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [premium, profile, syncEntitlement]);

  const priceFormatter = useMemo(
    () => price
      ? new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: price.currency.toUpperCase(),
        })
      : null,
    [price]
  );
  const formattedPrice = price && priceFormatter
    ? priceFormatter.format(price.amount / 100)
    : "Current price";

  return (
    <div className="h-full overflow-y-auto bg-background">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 pb-28">
        <header className="flex flex-col gap-2">
          <h1 className="t-title-1 text-[var(--ink-9)]">Peek Premium</h1>
          <p className="t-caption text-[var(--ink-5)]">
            {premium
              ? "Your premium subscription is active."
              : "Unlock all Premium features."}
          </p>
        </header>

        <section
          aria-label="Premium subscription"
          className="flex flex-col gap-4 rounded-[var(--r-lg)] border p-5"
          style={{
            background: premium
              ? "linear-gradient(135deg, #4a2874, #21142f)"
              : "linear-gradient(160deg, #3b1778, #201431)",
            borderColor: "rgba(154,104,245,0.45)",
          }}
        >
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden="true" size={22} color="#d8c8ff" />
            <p className="t-body-b text-white">Peek Premium</p>
            <span
              className="ml-auto rounded-full px-2 py-[3px] t-caption font-bold"
              style={{ background: "rgba(154,104,245,0.42)", color: "#d8c8ff" }}
            >
              {premium ? "Active" : "Unlock everything"}
            </span>
          </div>

          {premium ? (
            <div className="flex flex-col gap-2">
              <ManageSubscriptionButton fullWidth />
            </div>
          ) : (
            <PremiumUpgradeButton fullWidth />
          )}

          <div>
            <p className="t-caption" style={{ color: "rgba(255,255,255,0.58)" }}>From</p>
            <p className="text-2xl font-extrabold leading-7 text-white">
              {formattedPrice}{" "}
              <span className="text-sm font-normal" style={{ color: "rgba(255,255,255,0.55)" }}>
                {price?.interval ? `/ ${price.interval}` : "at checkout"}
              </span>
            </p>
          </div>

          <div className="border-t" style={{ borderColor: "rgba(154,104,245,0.35)" }} />

          <div className="flex flex-col gap-2.5">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5">
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                  style={{ background: "rgba(56,201,135,0.2)" }}
                >
                  <Check aria-hidden="true" size={11} color="var(--success-500)" />
                </span>
                <Icon aria-hidden="true" size={14} color="#c8aef5" />
                <span className="t-caption" style={{ color: "rgba(255,255,255,0.86)" }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {!premium ? (
          <p className="t-caption text-center text-[var(--ink-5)]">
            Your subscription renews automatically until canceled.
          </p>
        ) : null}
      </main>
    </div>
  );
}
