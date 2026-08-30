import {
  adminBotCollectionCommitPlan,
  type AdminBotCollectResult,
} from "@peekpoke/shared";
import { collectBot, type Coordinates } from "./api";

type NativeBotCollectionActions = {
  setBalance: (balance: number) => void;
  markCollected: (botId: string) => void;
  refetchBots: () => unknown;
};

export function applyNativeBotCollectionResult(
  botId: string,
  result: AdminBotCollectResult,
  actions: NativeBotCollectionActions,
) {
  const plan = adminBotCollectionCommitPlan(result);
  if (plan.balance !== null) actions.setBalance(plan.balance);
  if (plan.removeBot) actions.markCollected(botId);
  if (plan.refreshBots) actions.refetchBots();
}

export async function collectAndApplyNativeBot(
  botId: string,
  location: Coordinates,
  actions: NativeBotCollectionActions,
) {
  const result = await collectBot(botId, location);
  applyNativeBotCollectionResult(botId, result, actions);
}
