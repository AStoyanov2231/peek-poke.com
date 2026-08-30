"use client";

import { useState } from "react";
import { Crown, Loader2 } from "lucide-react";

export function PremiumUpgradeButton({ fullWidth }: { fullWidth?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = (await res.json()) as { error?: string; url?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout is unavailable.");
      window.location.href = data.url;
    } catch (err) {
      console.error("Checkout failed:", err);
      setError(err instanceof Error ? err.message : "Checkout is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={fullWidth ? "w-full" : undefined}>
      <button type="button"
        onClick={handleClick}
        disabled={loading}
        className={`h-12 bg-gradient-to-r from-amber-400 to-amber-500 text-white rounded-full px-4 text-sm font-semibold flex items-center gap-1.5 shadow-e-1 disabled:opacity-70 justify-center${fullWidth ? " w-full" : ""}`}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
        Upgrade to Premium
      </button>
      {error ? <p role="alert" className="mt-2 t-caption text-center text-red-200">{error}</p> : null}
    </div>
  );
}
