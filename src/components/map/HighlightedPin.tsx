"use client";

import { useCallback, useState, useTransition } from "react";
import { Marker } from "react-map-gl/maplibre";
import { useAppStore } from "@/stores/appStore";
import { InsufficientCoinsDialog } from "@/components/coins/InsufficientCoinsDialog";
import type { NearbyUser, ProfilePhoto, ProfileInterest } from "@/types/database";

const HP_PIN = 72;
const HP_WIDTH = 310;

interface HighlightedPinProps {
  user: NearbyUser;
  isFriend: boolean;
  isPremium: boolean;
  initialData: { photos: ProfilePhoto[]; interests: ProfileInterest[] };
}

export function HighlightedPin({ user, isFriend, isPremium, initialData }: HighlightedPinProps) {
  const setHighlightedUserId = useAppStore((s) => s.setHighlightedUserId);
  const addSentRequestFull = useAppStore((s) => s.addSentRequestFull);
  const setCoins = useAppStore((s) => s.setCoins);
  const triggerCoinSpent = useAppStore((s) => s.triggerCoinSpent);
  const coins = useAppStore((s) => s.coins);
  const hasSentRequest = useAppStore((s) => s.sentRequestUserIds.has(user.userId));
  const [showNoCoins, setShowNoCoins] = useState(false);
  const [, startTransition] = useTransition();
  const data = initialData;

  const handleAddFriend = useCallback(() => {
    if (hasSentRequest) return;
    if (coins < 1) {
      setShowNoCoins(true);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/friends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addressee_id: user.userId }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d.balance !== undefined) {
            setCoins(d.balance);
            triggerCoinSpent();
          }
          addSentRequestFull({
            ...d.friendship,
            addressee: {
              id: user.userId,
              username: user.username,
              display_name: user.display_name,
              avatar_url: user.avatar_url,
            },
          });
        } else {
          const d = await res.json();
          if (d.error === "INSUFFICIENT_COINS") setShowNoCoins(true);
        }
      } catch (err) {
        console.error("Failed to send friend request:", err);
      }
    });
  }, [user, hasSentRequest, coins, addSentRequestFull, setCoins, triggerCoinSpent, startTransition]);

  const handleSendMessage = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/dm/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.userId }),
        });
        if (res.ok) {
          const d = await res.json();
          setHighlightedUserId(null);
          window.location.href = `/chat/${d.thread_id}`;
        }
      } catch (err) {
        console.error("Failed to start DM:", err);
      }
    });
  }, [user.userId, setHighlightedUserId, startTransition]);

  const name = user.display_name || user.username || "";
  const initial = (name || "?").slice(0, 1).toUpperCase();
  const avatarClass = isFriend
    ? "user-pin-avatar user-pin-avatar-highlighted user-pin-avatar-friend"
    : "user-pin-avatar user-pin-avatar-highlighted";

  return (
    <Marker
      longitude={user.lng}
      latitude={user.lat}
      anchor="center"
      style={{ zIndex: 10 }}
    >
      <div className="hp-anchor" onClick={(e) => e.stopPropagation()}>
        <div className="hp-dialog" style={{ width: HP_WIDTH }}>
          {/* Avatar — top-center, partially above card */}
          <div style={{ position: "absolute", top: -(HP_PIN / 2), left: "50%", transform: "translateX(-50%)", zIndex: 1 }}>
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" loading="lazy" decoding="async" className={`${avatarClass} hp-avatar-spin`} style={{ width: HP_PIN, height: HP_PIN }} />
            ) : (
              <div className={`${avatarClass} user-pin-avatar-fallback hp-avatar-spin`} style={{ width: HP_PIN, height: HP_PIN, fontSize: 28 }}>
                {initial}
              </div>
            )}
          </div>

          {/* Close button — absolute top-right, circular */}
          <button className="hp-close-btn" aria-label="Close" onClick={() => setHighlightedUserId(null)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Header — name only */}
          <div className="hp-header">
            <span className="hp-name">{name}</span>
          </div>

          {/* Photos — 2 landscape photos, shown once loaded */}
          {data !== null && data.photos.length > 0 && (
            <div className={`hp-photo-grid${data.photos.length === 1 ? " hp-photo-grid-single" : ""}`}>
              {data.photos.slice(0, 2).map(p => (
                <img key={p.id} src={p.url} alt="" loading="lazy" decoding="async" className="hp-photo" />
              ))}
            </div>
          )}

          {/* Action row */}
          <div className="hp-action-row">
            {!isFriend && (
              <button
                className={`hp-action-btn hp-action-btn-add ${hasSentRequest ? "hp-action-btn-disabled" : ""}`}
                onClick={handleAddFriend}
                disabled={hasSentRequest}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
                <span>{hasSentRequest ? "Requested" : "Add"}</span>
              </button>
            )}
            {(isFriend || isPremium) && (
              <button className="hp-action-btn" onClick={handleSendMessage}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                <span>Message</span>
              </button>
            )}
            <button
              className="hp-action-btn"
              onClick={() => { window.location.href = `/profile/${user.userId}`; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Profile</span>
            </button>
          </div>
        </div>
      </div>
      <InsufficientCoinsDialog open={showNoCoins} onOpenChange={setShowNoCoins} />
    </Marker>
  );
}
