"use client";

import { useState } from "react";
import { Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isNativeApp } from "@/lib/native";

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  const [showWebNotice, setShowWebNotice] = useState(false);

  const handleClick = async () => {
    // Every current subscription was purchased on the web (Stripe). The native
    // app can't open the Stripe portal, so it explains where to manage it.
    if (isNativeApp()) {
      setShowWebNotice(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error("Portal error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-1.5 text-sm font-semibold disabled:opacity-70"
        style={{ color: "oklch(0.85 0.12 282)" }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
        Manage
      </button>
      <Dialog open={showWebNotice} onOpenChange={setShowWebNotice}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subscription managed on the web</DialogTitle>
            <DialogDescription>
              Your Premium subscription was purchased on the web, so it can&apos;t be
              managed in this app. Visit peek-poke.com in a browser to manage or
              cancel it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowWebNotice(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
