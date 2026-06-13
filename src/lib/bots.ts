import { useAppStore } from "@/stores/appStore";

/** Max distance (km) from a bot at which it can be collected — mirrors /api/bots. */
export const BOT_COLLECT_RANGE_KM = 0.05;

/**
 * Collect a coin bot: POST the collect, update the wallet, refill the pool.
 * Returns true when the bot was collected. Shared by web BotPin taps and
 * native map pin taps (NativeMapBridge).
 */
export async function collectBot(botId: string): Promise<boolean> {
  const loc = useAppStore.getState().userLocation;
  if (!loc) return false;
  try {
    const res = await fetch("/api/bots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: botId, lat: loc.lat, lng: loc.lng }),
    });
    const data = await res.json();
    if (!data.ok) return false;
    useAppStore.getState().removeBot(botId);
    useAppStore.getState().setCoins(data.balance);
    // Refill the pool around the current position
    fetch(`/api/bots?lat=${loc.lat}&lng=${loc.lng}`)
      .then((r) => r.json())
      .then((bots) => {
        if (Array.isArray(bots)) useAppStore.getState().setBots(bots);
      })
      .catch(() => {});
    return true;
  } catch (err) {
    console.error("Bot collect failed:", err);
    return false;
  }
}
