"use client";

import { CalendarPlus, MapPin, X } from "lucide-react";
import { useState } from "react";

interface ChatProximityBannerProps {
  name: string;
  onPlanAnother?: () => void;
  visible: boolean;
}

/**
 * Coarse discovery proximity helps people decide whether to make a plan.
 * Mutual meetup acknowledgement is available separately in the chat.
 */
export function ChatProximityBanner({
  name,
  onPlanAnother,
  visible,
}: ChatProximityBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (!visible || dismissed) return null;

  return (
    <div
      className="mx-4 mt-3 flex flex-shrink-0 gap-2.5 rounded-md border px-3 py-2.5"
      style={{ background: "var(--primary-50)", borderColor: "var(--primary-100)" }}
    >
      <MapPin size={16} style={{ color: "var(--primary-500)", flexShrink: 0 }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="t-caption" style={{ color: "var(--primary-600)" }}>
              You&apos;re in the same approximate area as {name}
            </p>
            <p className="t-caption text-ink-6">If you meet, each person can mark it in chat.</p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="iconbtn -mt-2 -mr-2 flex-shrink-0"
            style={{ width: 44, height: 44, color: "var(--primary-400)" }}
            aria-label="Dismiss proximity message"
          >
            <X size={14} />
          </button>
        </div>
        {onPlanAnother ? (
          <button type="button" className="mt-1 inline-flex min-h-11 items-center gap-1 t-caption font-semibold text-primary-600" onClick={onPlanAnother}>
            <CalendarPlus size={14} aria-hidden="true" />Make a plan
          </button>
        ) : null}
      </div>
    </div>
  );
}
