/**
 * Collect a coin bot: POST the collect, update the wallet, refill the pool.
 * Returns the validated server outcome, or false when transport fails.
 */
export async function collectBot(
  botId: string,
  loc: { lat: number; lng: number } | null,
): Promise<AdminBotCollectResult | false> {
  if (!loc) return false;
  try {
    const body = adminBotCollectRequestSchema.parse({
      id: botId,
      lat: loc.lat,
      lng: loc.lng,
    });
    const result = await fetchContract<AdminBotCollectResult>("/api/bots", adminBotCollectResultSchema, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return result;
  } catch (err) {
    console.error("Bot collect failed:", err);
    return false;
  }
}
import {
  adminBotCollectRequestSchema,
  adminBotCollectResultSchema,
  type AdminBotCollectResult,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";
