"use client";

import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  activateReadReceiptThread,
  deactivateReadReceiptThread,
  markActiveThreadRead,
  subscribeReadReceiptFailures,
} from "@/data/read-receipt";
import { webQueryKeys } from "@/data/web-query";

const MAX_AUTOMATIC_RECOVERIES = 2;

export function useReadReceipt(accountId: string | undefined, threadId: string) {
  const queryClient = useQueryClient();
  const ownerKey = `${accountId ?? "signed-out"}:${threadId}`;
  const tokenRef = useRef<ReturnType<typeof activateReadReceiptThread>>(null);
  const statusRef = useRef<"idle" | "pending" | "error">("idle");
  const automaticRecoveriesRef = useRef(0);
  const [state, setState] = useState<{
    ownerKey: string;
    status: "idle" | "pending" | "error";
    error: string | null;
  }>(() => ({ ownerKey, status: "idle", error: null }));

  const setCurrentStatus = useCallback((
    next: "idle" | "pending" | "error",
    nextError: string | null = null,
  ) => {
    statusRef.current = next;
    setState({ ownerKey, status: next, error: nextError });
  }, [ownerKey]);

  const attempt = useCallback(() => {
    const attemptToken = tokenRef.current;
    if (!accountId || !attemptToken || statusRef.current === "pending") return;
    setCurrentStatus("pending");
    void markActiveThreadRead(accountId, threadId)
      .then(async () => {
        if (tokenRef.current !== attemptToken) return;
        automaticRecoveriesRef.current = 0;
        await queryClient.invalidateQueries({
          queryKey: webQueryKeys.threads,
          exact: true,
        });
        if (tokenRef.current === attemptToken) setCurrentStatus("idle");
      })
      .catch((failure: unknown) => {
        if (
          tokenRef.current !== attemptToken
          || (failure instanceof Error && failure.name === "AbortError")
        ) return;
        setCurrentStatus(
          "error",
          failure instanceof Error ? failure.message : "Read receipt failed",
        );
      });
  }, [accountId, queryClient, setCurrentStatus, threadId]);

  useLayoutEffect(() => {
    automaticRecoveriesRef.current = 0;
    statusRef.current = "idle";
    if (!accountId) {
      tokenRef.current = null;
      return;
    }
    const token = activateReadReceiptThread(accountId, threadId);
    tokenRef.current = token;
    return () => {
      if (tokenRef.current === token) tokenRef.current = null;
      if (token) deactivateReadReceiptThread(token);
    };
  }, [accountId, threadId]);

  useEffect(() => {
    if (!accountId || !tokenRef.current) return;
    const stopFailures = subscribeReadReceiptFailures((failedAccountId, failedThreadId, failure) => {
      if (
        tokenRef.current
        && failedAccountId === accountId
        && failedThreadId === threadId
      ) {
        setCurrentStatus(
          "error",
          failure instanceof Error ? failure.message : "Read receipt failed",
        );
      }
    });
    attempt();
    const recover = () => {
      if (
        statusRef.current !== "error"
        || automaticRecoveriesRef.current >= MAX_AUTOMATIC_RECOVERIES
      ) return;
      automaticRecoveriesRef.current += 1;
      attempt();
    };
    const stopOnline = onlineManager.subscribe((online) => {
      if (online) recover();
    });
    const onVisibility = () => {
      if (document.visibilityState === "visible" && onlineManager.isOnline()) recover();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopFailures();
      stopOnline();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [accountId, attempt, setCurrentStatus, threadId]);

  const visibleState = state.ownerKey === ownerKey
    ? state
    : { status: "idle" as const, error: null };

  return {
    error: visibleState.error,
    isPending: visibleState.status === "pending",
    retry: attempt,
  };
}
