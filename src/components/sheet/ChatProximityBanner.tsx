"use client";

import { useState } from "react";
import { MapPin, X } from "lucide-react";

interface ChatProximityBannerProps {
  distanceMeters: number;
  name: string;
  threadId: string;
}

export function ChatProximityBanner({ distanceMeters, name, threadId }: ChatProximityBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5 mx-4 mt-3 rounded-md border flex-shrink-0"
      style={{ background: "var(--primary-50)", borderColor: "var(--primary-100)" }}
    >
      <MapPin size={16} style={{ color: "var(--primary-500)", flexShrink: 0 }} />
      <p className="t-caption flex-1" style={{ color: "var(--primary-600)" }}>
        You&apos;re {distanceMeters}m from {name}
      </p>
      {distanceMeters < 100 && (
        <button className="t-caption font-semibold flex-shrink-0" style={{ color: "var(--primary-500)" }}>
          Meet &amp; earn
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        className="iconbtn flex-shrink-0"
        style={{ width: 24, height: 24, color: "var(--primary-400)" }}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
