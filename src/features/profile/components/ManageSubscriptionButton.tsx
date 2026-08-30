"use client";

import { useState } from "react";
import { Loader2, Settings } from "lucide-react";

export function ManageSubscriptionButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { error?: string; url?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Subscription management is unavailable.");
      window.location.href = data.url;
    } catch (err) {
      console.error("Portal error:", err);
      setError(err instanceof Error ? err.message : "Subscription management is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={fullWidth ? "w-full" : undefined}>
      <button type="button"
        onClick={handleClick}
        disabled={loading}
        className={fullWidth
          ? "btn btn-secondary btn-lg btn-block disabled:opacity-70"
          : "flex items-center gap-1.5 text-sm font-semibold disabled:opacity-70"}
        style={fullWidth ? undefined : { color: "oklch(0.85 0.12 282)" }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
        Manage Subscription
      </button>
      {error ? <p role="alert" className="mt-2 t-caption text-center text-red-200">{error}</p> : null}
    </div>
  );
}
