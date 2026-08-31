import type { QueryClient } from "@tanstack/react-query";
import {
  adminBotCollectionCommitPlan,
  type AdminBot,
  type AdminBotCollectResult,
} from "@peekpoke/shared";
import { webQueryKeys } from "@/data/web-query";
import { collectBot } from "@/lib/bots";

type Location = { lat: number; lng: number };

export async function applyWebBotCollectionResult(
  queryClient: Pick<QueryClient, "setQueryData" | "invalidateQueries">,
  botId: string,
  viewerId: string,
  location: Location,
  result: AdminBotCollectResult,
) {
  const plan = adminBotCollectionCommitPlan(result);
  if (plan.balance !== null) {
    queryClient.setQueryData(webQueryKeys.coins, { balance: plan.balance });
  }
  if (plan.removeBot) {
    queryClient.setQueryData<AdminBot[]>(
      webQueryKeys.bots(viewerId, location.lat, location.lng),
      (current) => current?.filter((bot) => bot.id !== botId),
    );
  }
  if (plan.refreshBots) {
    await queryClient.invalidateQueries({
      queryKey: webQueryKeys.bots(viewerId, location.lat, location.lng),
    });
  }
}

export async function collectAndApplyWebBot(
  queryClient: Pick<QueryClient, "setQueryData" | "invalidateQueries">,
  botId: string,
  viewerId: string,
  location: Location,
) {
  const result = await collectBot(botId, location);
  if (!result) return false;
  await applyWebBotCollectionResult(queryClient, botId, viewerId, location, result);
  return true;
}
