"use client";

import { memo, useState } from "react";
import { Marker } from "react-map-gl/mapbox";
import { Coins } from "lucide-react";
import { collectBot } from "@/lib/bots";
import type { Bot } from "@/stores/appStore";

interface BotPinProps {
  bot: Bot;
  collectable: boolean;
}

export const BotPin = memo(function BotPin({ bot, collectable }: BotPinProps) {
  const [collecting, setCollecting] = useState(false);
  const [hint, setHint] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!collectable) {
      setHint(true);
      setTimeout(() => setHint(false), 2000);
      return;
    }
    if (collecting) return;
    setCollecting(true);
    await collectBot(bot.id);
    setCollecting(false);
  };

  return (
    <Marker longitude={bot.lng} latitude={bot.lat} anchor="center" style={{ zIndex: 5 }}>
      <div style={{ position: "relative", cursor: "pointer" }} onClick={handleClick}>
        <div
          className={collectable ? "presence-pulse" : ""}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: collectable ? "var(--warn-500)" : "var(--ink-3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "3px solid white",
            boxShadow: "var(--e-2)",
            opacity: collecting ? 0.5 : 1,
            transition: "opacity 0.2s",
          }}
        >
          <Coins size={18} strokeWidth={2} color={collectable ? "white" : "var(--ink-6)"} />
        </div>
        {hint && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              background: "var(--ink-9)",
              color: "white",
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 8,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            Get closer
          </div>
        )}
      </div>
    </Marker>
  );
});
