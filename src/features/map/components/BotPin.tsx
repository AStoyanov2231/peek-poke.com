"use client";

import { memo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Marker } from "react-map-gl/mapbox";
import { Coins } from "lucide-react";
import { collectAndApplyWebBot } from "@/data/bot-collection";
import type { Bot } from "@/stores/appStore";

interface BotPinProps {
  bot: Bot;
  viewerId: string;
  location: { lat: number; lng: number } | null;
  collectable: boolean;
}

export const BotPin = memo(function BotPin({ bot, viewerId, location, collectable }: BotPinProps) {
  const queryClient = useQueryClient();
  const [collecting, setCollecting] = useState(false);
  const [hint, setHint] = useState(false);

  const handleClick = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!viewerId || !collectable) {
      setHint(true);
      setTimeout(() => setHint(false), 2000);
      return;
    }
    if (collecting) return;
    setCollecting(true);
    await collectAndApplyWebBot(queryClient, bot.id, viewerId, location!);
    setCollecting(false);
  };

  return (
    <Marker longitude={bot.lng} latitude={bot.lat} anchor="center" style={{ zIndex: 5 }}>
      <div style={{ position: "relative", cursor: "pointer" }} role="button" tabIndex={0} aria-label={`Collect coin ${bot.id}`} onClick={handleClick} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void handleClick(); } }}>
        <div
          className={`${collectable ? "presence-pulse" : ""} bot-pin-marker`}
          style={{ background: collectable ? "var(--warn-500)" : "var(--ink-3)", opacity: collecting ? 0.5 : 1 }}
        >
          <Coins size={18} strokeWidth={2} color={collectable ? "white" : "var(--ink-6)"} />
        </div>
        {hint && (
          <div className="bot-pin-hint">
            Get closer
          </div>
        )}
      </div>
    </Marker>
  );
});
