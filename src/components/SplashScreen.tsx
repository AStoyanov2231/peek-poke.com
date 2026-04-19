"use client";
import Image from "next/image";
import { useIsPreloading, usePreloadError } from "@/stores/selectors";
import { useAppStore } from "@/stores/appStore";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function SplashScreen() {
  const isPreloading = useIsPreloading();
  const preloadError = usePreloadError();
  const preloadAll = useAppStore((state) => state.preloadAll);

  if (!isPreloading && !preloadError) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-background">
      <div className="relative z-10 flex flex-col items-center">
        {/* Logo with orbiting planet */}
        <div className="relative w-32 h-32 mb-6">
          {/* Orbit ring */}
          <div className="absolute inset-0 rounded-full shadow-neu-inset" />
          {/* Orbiting planet */}
          <div className="absolute inset-0 animate-[orbit_3s_linear_infinite]">
            <svg width="14" height="14" viewBox="0 0 14 14" className="absolute -top-[7px] left-1/2 -translate-x-1/2">
              <circle cx="7" cy="7" r="6" fill="hsl(250, 53%, 57%)" opacity="0.9" />
              <circle cx="7" cy="7" r="7" fill="none" stroke="hsl(250, 53%, 57%)" strokeWidth="0.5" opacity="0.3" />
            </svg>
          </div>
          {/* Logo centered */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Image src="/images/logo.png" alt="" width={64} height={64} />
          </div>
        </div>

        <h1 className="text-2xl font-display font-bold mb-2">
          <span className="text-brand-gradient">Peek &amp; Poke</span>
        </h1>
        <p className="text-sm mb-8 text-muted-foreground">We&apos;re setting things up for you</p>

        {preloadError ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-center max-w-xs text-destructive">{preloadError}</p>
            <Button
              onClick={() => preloadAll()}
              variant="outline"
              className="rounded-full font-medium px-6"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        ) : null}
      </div>

      <style jsx>{`
        @keyframes orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
