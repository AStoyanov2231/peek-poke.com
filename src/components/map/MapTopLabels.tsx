"use client";

import { useCoins, useFriends, useOnlineUsers } from "@/stores/selectors";
import { useAppStore } from "@/stores/appStore";

const CoinIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#FCD34D" />
    <circle cx="12" cy="12" r="10" stroke="#F59E0B" strokeWidth="1.5" />
    <text x="12" y="16.5" textAnchor="middle" fill="#92400E" fontSize="11" fontWeight="bold">C</text>
  </svg>
);

const PersonIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#4ADE80">
    <path d="M12 12c2.7 0 4-1.79 4-4s-1.3-4-4-4-4 1.79-4 4 1.3 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

const pill = "flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold select-none whitespace-nowrap relative";

export function MapTopLabels() {
  const coins = useCoins();
  const friends = useFriends();
  const onlineUsers = useOnlineUsers();
  const coinSpent = useAppStore((s) => s.coinSpent);
  const coinSpentCount = useAppStore((s) => s.coinSpentCount);

  const friendsOnline = friends.filter((f) => onlineUsers.has(f.id)).length;

  return (
    <>
      {/* Logo — desktop only, top-left overlay container */}
      <div className="absolute top-3 left-3 z-30 hidden md:flex items-center bg-background/80 backdrop-blur-sm rounded-2xl shadow-lg px-3 py-2">
        <span className="text-lg font-bold whitespace-nowrap text-brand-gradient">Peek &amp; Poke</span>
      </div>

      {/* Coins + online counter — centered on mobile, top-right overlay container on desktop */}
      <div className="absolute top-3 right-4 z-30 flex gap-2 max-md:right-auto max-md:left-1/2 max-md:-translate-x-1/2 bg-background/80 backdrop-blur-sm rounded-2xl shadow-lg p-2">
        <div className={pill}>
          <CoinIcon />
          <span className="tabular-nums">{coins}/5 coins</span>
          {coinSpent && (
            <span key={coinSpentCount} className="coin-spent-anim">-1</span>
          )}
        </div>
        <div className={pill}>
          <PersonIcon />
          <span className="tabular-nums">{friendsOnline} online</span>
        </div>
      </div>
    </>
  );
}
