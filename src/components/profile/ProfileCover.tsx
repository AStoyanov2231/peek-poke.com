"use client";

import { Settings, Share2 } from "lucide-react";

interface ProfileCoverProps {
  coverImageUrl?: string | null;
  heightMobile?: number;
  heightDesktop?: number;
  onSettings?: () => void;
  onShare?: () => void;
}

const GRADIENT_FALLBACK =
  "linear-gradient(135deg, oklch(0.32 0.14 282) 0%, oklch(0.48 0.18 282) 60%, oklch(0.56 0.20 282) 100%)";

export function ProfileCover({
  coverImageUrl,
  heightMobile = 190,
  heightDesktop = 220,
  onSettings,
  onShare,
}: ProfileCoverProps) {
  return (
    <div
      data-profile-cover
      className="relative flex-shrink-0 overflow-hidden"
      style={{
        height: heightMobile,
        background: coverImageUrl ? undefined : GRADIENT_FALLBACK,
      }}
    >
      {/* CSS variable override for desktop height */}
      <style>{`@media (min-width:768px){[data-profile-cover]{height:${heightDesktop}px!important}}`}</style>

      {coverImageUrl && (
        <img
          src={coverImageUrl}
          alt="Cover"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Glass action buttons — both top-right */}
      <div className="absolute top-3 right-3 flex gap-2">
        {onShare && (
          <button
            onClick={onShare}
            className="iconbtn"
            style={{ width: 36, height: 36, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", color: "var(--ink-7)" }}
            aria-label="Share"
          >
            <Share2 size={15} strokeWidth={2} />
          </button>
        )}
        {onSettings && (
          <button
            onClick={onSettings}
            className="iconbtn"
            style={{ width: 36, height: 36, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", color: "var(--ink-7)" }}
            aria-label="Settings"
          >
            <Settings size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
