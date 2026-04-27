"use client";
import Image from "next/image";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsPreloading, usePreloadError } from "@/stores/selectors";
import { useAppStore } from "@/stores/appStore";

export function SplashScreen() {
  const isPreloading = useIsPreloading();
  const preloadError = usePreloadError();
  const preloadAll = useAppStore((state) => state.preloadAll);

  if (!isPreloading && !preloadError) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-ink-1">
      <div className="flex flex-col items-center gap-4">
        {/* Pulsing logo tile */}
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center animate-pulse"
          style={{ background: "var(--primary-500)" }}
        >
          <Image src="/images/logo.png" alt="" width={36} height={36} />
        </div>

        <h1 className="t-title-2 text-ink-9">Peek &amp; Poke</h1>
        <p className="t-caption muted">Setting things up…</p>

        {preloadError && (
          <div className="flex flex-col items-center gap-3 mt-2">
            <p className="t-caption text-center max-w-xs" style={{ color: "var(--danger-500)" }}>{preloadError}</p>
            <Button onClick={() => preloadAll()} variant="secondary" className="rounded-pill">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
