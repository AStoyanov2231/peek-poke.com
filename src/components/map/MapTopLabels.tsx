"use client";

import { Coins } from "lucide-react";
import { useCoins, useFriends, useOnlineUsers } from "@/stores/selectors";
import { useAppStore } from "@/stores/appStore";

export function MapTopLabels() {
  const coins = useCoins();
  const friends = useFriends();
  const onlineUsers = useOnlineUsers();
  const coinSpent = useAppStore((s) => s.coinSpent);
  const coinSpentCount = useAppStore((s) => s.coinSpentCount);

  const friendsOnline = friends.filter((f) => onlineUsers.has(f.id)).length;

  return (
    <>
      <style>{`@media(min-width:768px){.map-top-labels{top:16px!important}}`}</style>
      <div
        className="map-top-labels absolute left-4 z-30 flex gap-2.5 items-center"
        style={{ top: "calc(var(--safe-area-top) + 112px)" }}
      >
        {/* Online pill */}
        <div
          className="flex items-center gap-2 h-[36px] px-3.5 rounded-pill shadow-e-1"
          style={{
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            fontSize: 13, fontWeight: 600,
            color: "var(--ink-8)",
          }}
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: "var(--success-500)" }}
          />
          <span>{friendsOnline} friends online</span>
        </div>

        {/* Coin pill */}
        <div
          className="flex items-center gap-2 h-[36px] px-3.5 rounded-pill text-white relative"
          style={{ background: "var(--ink-9)", fontSize: 13, fontWeight: 600 }}
        >
          <Coins size={15} strokeWidth={2} style={{ color: "oklch(0.85 0.15 85)" }} />
          <span className="tabular-nums">{coins} / 5</span>
          <span style={{ opacity: 0.7 }}>coins</span>
          {coinSpent && (
            <span key={coinSpentCount} className="coin-spent-anim">-1</span>
          )}
        </div>
      </div>
    </>
  );
}
