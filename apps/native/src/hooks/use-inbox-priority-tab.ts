import { useEffect, useReducer } from "react";
import { preferredInboxTab, type InboxTab } from "@/lib/inbox-priority";

type QueryState = "pending" | "success" | "error";

type PriorityInput = {
  accountId: string | undefined;
  identityState: QueryState;
  explicitTab: InboxTab | null;
  pendingReceivedPokeCount: number;
  actionablePlanCount: number;
  pokesState: QueryState;
  plansState: QueryState;
};

type AutomaticChoice = {
  accountId: string | null;
  tab: InboxTab | null;
};

function automaticChoiceReducer(
  current: AutomaticChoice,
  next: AutomaticChoice,
): AutomaticChoice {
  if (current.accountId === next.accountId && current.tab === next.tab) return current;
  return next;
}

/**
 * Keeps an automatic Inbox selection scoped to the signed-in account.
 * A failed first request remains retryable, so it cannot permanently freeze
 * an empty Chats tab before Pokes and Plans have loaded.
 */
export function useInboxPriorityTab({
  accountId,
  identityState,
  explicitTab,
  pendingReceivedPokeCount,
  actionablePlanCount,
  pokesState,
  plansState,
}: PriorityInput) {
  const [savedChoice, saveAutomaticChoice] = useReducer(automaticChoiceReducer, {
    accountId: null,
    tab: null,
  });
  const dataReady = identityState === "success"
    && Boolean(accountId)
    && pokesState === "success"
    && plansState === "success";
  const dataFailed = identityState === "error"
    || (identityState === "success" && Boolean(accountId) && (pokesState === "error" || plansState === "error"));
  const automaticChoice = savedChoice.accountId === accountId
    ? savedChoice.tab
    : null;
  const suggestedTab = dataReady
    ? preferredInboxTab({ pendingReceivedPokeCount, actionablePlanCount })
    : null;
  const tab = explicitTab ?? automaticChoice ?? suggestedTab;
  const needsAutomaticChoice = !explicitTab && automaticChoice === null;

  useEffect(() => {
    if (identityState === "success" && !explicitTab && accountId && automaticChoice === null && suggestedTab) {
      saveAutomaticChoice({ accountId, tab: suggestedTab });
    }
  }, [accountId, automaticChoice, explicitTab, identityState, suggestedTab]);

  return {
    tab,
    waitingForPriority: needsAutomaticChoice && !dataReady && !dataFailed,
    priorityError: needsAutomaticChoice && dataFailed,
  };
}
