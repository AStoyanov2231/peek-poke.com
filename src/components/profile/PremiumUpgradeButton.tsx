"use client";

import { useState } from "react";
import { Crown, Loader2 } from "lucide-react";

export function PremiumUpgradeButton() {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error("Checkout failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="bg-gradient-to-r from-amber-400 to-amber-500 text-white rounded-full px-4 py-2 text-sm font-semibold flex items-center gap-1.5 shadow-neu-raised-sm disabled:opacity-70"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Crown className="h-4 w-4" />
      )}
      Upgrade to Premium
    </button>
  );
}
