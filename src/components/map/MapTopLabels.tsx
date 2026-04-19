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

const containerCls = "bg-primary-gradient rounded-2xl shadow-lg text-white text-sm font-semibold select-none whitespace-nowrap";

export function MapTopLabels() {
  const coins = useCoins();
  const friends = useFriends();
  const onlineUsers = useOnlineUsers();
  const coinSpent = useAppStore((s) => s.coinSpent);
  const coinSpentCount = useAppStore((s) => s.coinSpentCount);

  const friendsOnline = friends.filter((f) => onlineUsers.has(f.id)).length;

  return (
    <>
      {/* Logo — desktop only */}
      <div className={`absolute top-3 left-3 z-30 hidden md:flex items-center px-3 py-2 ${containerCls}`}>
        <span className="text-lg font-bold">Peek &amp; Poke</span>
      </div>

      {/* Coins + online counter */}
      <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 px-6 py-3 text-base ${containerCls}`}>
        <div className="flex items-center gap-1.5 relative">
          <CoinIcon />
          <span className="tabular-nums">{coins}/5 coins</span>
          {coinSpent && <span key={coinSpentCount} className="coin-spent-anim">-1</span>}
        </div>
        <div className="w-px h-4 bg-white/30" />
        <div className="flex items-center gap-1.5">
          <PersonIcon />
          <span className="tabular-nums">{friendsOnline} online</span>
        </div>
      </div>
    </>
  );
}
