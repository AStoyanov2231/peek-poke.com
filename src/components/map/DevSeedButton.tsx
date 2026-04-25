"use client";

import { useAppStore } from "@/stores/appStore";
import { useUserLocation } from "@/stores/selectors";

if (process.env.NODE_ENV === "production") {
  throw new Error("DevSeedButton must not be used in production");
}

const SEED_AVATARS = [
  "https://api.dicebear.com/7.x/avataaars/svg?seed=alpha",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=beta",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=gamma",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=delta",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=epsilon",
];

function randomOffset() {
  return (Math.random() - 0.5) * 0.002;
}

export function DevSeedButton() {
  const userLocation = useUserLocation();
  const nearbyUsers = useAppStore(s => s.nearbyUsers);
  const hasSeeded = nearbyUsers.some(u => u.userId.startsWith("dev-seed-"));

  const seed = () => {
    if (!userLocation) return;
    const fakeUsers = SEED_AVATARS.map((avatar, i) => ({
      userId: `dev-seed-${i}`,
      username: `devuser${i}`,
      display_name: `Dev User ${i + 1}`,
      avatar_url: avatar,
      lat: userLocation.lat + randomOffset(),
      lng: userLocation.lng + randomOffset(),
    }));
    useAppStore.setState(state => ({
      nearbyUsers: [...fakeUsers, ...state.nearbyUsers.filter(u => !u.userId.startsWith("dev-seed-"))],
    }));
  };

  const clear = () => {
    useAppStore.setState(state => ({
      nearbyUsers: state.nearbyUsers.filter(u => !u.userId.startsWith("dev-seed-")),
    }));
  };

  return (
    <div className="absolute bottom-32 right-4 z-50 flex flex-col gap-1">
      <button
        onClick={seed}
        className="btn btn-secondary btn-sm text-xs px-2 py-1"
      >
        Seed users
      </button>
      {hasSeeded && (
        <button
          onClick={clear}
          className="btn btn-secondary btn-sm text-xs px-2 py-1"
        >
          Clear seed
        </button>
      )}
    </div>
  );
}
