"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { bootstrapQueryOptions, observeMeetingAuthOwner, WebQueryError } from "@/data/web-query";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useIncomingCall } from "@/features/call/useIncomingCall";
import { recoverUnauthorizedWebSession } from "@/features/auth/session-recovery";
import { useCallStore } from "@/stores/callStore";
import { WebLocationPresenceProvider } from "@/features/map/useNearbyPresence";

interface PreloadProviderProps {
  children: ReactNode;
}

function DeferredEffects({ profileId }: { profileId: string | undefined }) {
  useRealtimeSync();
  useIncomingCall(profileId);
  return null;
}

function useCallAccountSessionOwner(accountId: string | null) {
  const observedAccountId = useCallStore((state) => state.accountId);
  const terminalFencesReady = useCallStore((state) => state.terminalFencesReady);
  useEffect(() => {
    if (!accountId) return;
    const store = useCallStore.getState();
    store.observeAccount(accountId);
    const generation = useCallStore.getState().generation;
    void useCallStore.getState().hydrateTerminalCallFences(accountId, generation);
  }, [accountId]);
  return Boolean(accountId && observedAccountId === accountId && terminalFencesReady);
}

export function PreloadProvider({ children }: PreloadProviderProps) {
  const bootstrap = useQuery(bootstrapQueryOptions);
  const [deferred, setDeferred] = useState(false);
  const callAccountId = bootstrap.data?.identity.id ?? null;
  const callAccountReady = useCallAccountSessionOwner(callAccountId);

  useEffect(() => {
    observeMeetingAuthOwner(callAccountId);
  }, [callAccountId]);

  useEffect(() => {
    if (bootstrap.error instanceof WebQueryError && bootstrap.error.status === 401) {
      recoverUnauthorizedWebSession();
    }
  }, [bootstrap.error]);

  useEffect(() => {
    if (typeof requestIdleCallback !== "undefined") {
      const idleId = requestIdleCallback(() => setDeferred(true));
      return () => cancelIdleCallback(idleId);
    }

    const timeoutId = setTimeout(() => setDeferred(true), 0);
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <WebLocationPresenceProvider userId={bootstrap.data?.identity.id}>
      {deferred && bootstrap.data && callAccountReady && (
        <DeferredEffects profileId={bootstrap.data.identity.id} />
      )}
      {children}
    </WebLocationPresenceProvider>
  );
}
