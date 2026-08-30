"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  incomingCallInviteAction,
  parseScopedCallSignalEvent,
} from "@peekpoke/shared";
import { createClient } from "@/lib/supabase/client";
import { postCallSignal, RING_SIGNAL_EVENT } from "@/lib/webrtc/signaling";
import { useIsPreloading } from "@/stores/selectors";
import { useCallStore } from "@/stores/callStore";

const supabase = createClient();
const RING_TIMEOUT_MS = 30_000;

function subscribeToBroadcast(
  channel: RealtimeChannel,
  event: string,
  handler: ({ payload }: { payload?: unknown }) => void | Promise<void>,
) {
  channel.on("broadcast", { event }, handler);
  return channel.subscribe();
}

export function useIncomingCall(userId: string | undefined) {
  const isPreloading = useIsPreloading();
  const terminalFencesReady = useCallStore((state) => state.terminalFencesReady);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Realtime ring delivery is always treated as untrusted input and parsed
  // against the authenticated account before it can mutate call state.
  useEffect(() => {
    if (isPreloading || !userId || !terminalFencesReady) return;
    const generation = useCallStore.getState().generation;
    let listening = true;
    const channel = supabase.channel(`calls:user:${userId}`, { config: { private: true } });
    const subscription = subscribeToBroadcast(channel, RING_SIGNAL_EVENT, async ({ payload }) => {
      const synchronized = await useCallStore.getState()
        .synchronizeTerminalCallFences(userId, generation);
      if (!listening || !synchronized || useCallStore.getState().generation !== generation) return;
      const parsed = parseScopedCallSignalEvent(payload, {
        accountId: userId,
        nowMs: useCallStore.getState().callSignalNowMs(),
      });
      if (!parsed.success || useCallStore.getState().generation !== generation) return;
      const event = parsed.event;

      if (event.type === "invite") {
        const state = useCallStore.getState();
        if (state.isTerminalCallFenced(event.callId, generation)) return;
        const existing = state.incomingInvite;
        const action = incomingCallInviteAction(
          event.callId,
          state.activeCall?.callId,
          existing?.callId,
        );
        if (action === "ignore") return;
        if (action === "reject-busy") {
          void postCallSignal(event.threadId, {
            version: 1,
            type: "reject",
            commandId: crypto.randomUUID(),
            callId: event.callId,
            capability: event.capability,
            reason: "busy",
          }).catch(() => undefined);
          return;
        }

        if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
        if (!state.setIncomingInvite({
          accountId: userId,
          generation,
          threadId: event.threadId,
          callId: event.callId,
          fromUser: event.fromUser,
          capability: event.capability,
          lastSequence: event.sequence,
          expiresAt: event.expiresAt,
        })) return;

        const expiresAt = Date.parse(event.expiresAt);
        ringTimeoutRef.current = setTimeout(() => {
          useCallStore.getState().clearInvite(event.callId, generation);
        }, Math.max(0, Math.min(RING_TIMEOUT_MS, expiresAt - Date.now())));
        return;
      }

      if (event.type !== "cancel" && event.type !== "reject" && event.type !== "end") return;
      const state = useCallStore.getState();
      const current = state.incomingInvite;
      const active = state.activeCall;
      if (current?.callId === event.callId) {
        const scoped = parseScopedCallSignalEvent(event, {
          accountId: userId,
          threadId: current.threadId,
          callId: current.callId,
          peerUserId: current.fromUser.id,
          capability: current.capability,
          lastSequence: current.lastSequence,
          nowMs: useCallStore.getState().callSignalNowMs(),
        });
        if (!scoped.success) return;
      } else if (active?.callId === event.callId) {
        const scoped = parseScopedCallSignalEvent(event, {
          accountId: userId,
          threadId: active.threadId,
          callId: active.callId,
          peerUserId: active.peer.id,
          capability: active.capability ?? undefined,
          lastSequence: active.lastSequence,
          nowMs: useCallStore.getState().callSignalNowMs(),
        });
        if (!scoped.success) return;
      }
      if (!state.fenceTerminalCall(event.callId, generation)) return;
      if (!current || current.callId !== event.callId) return;
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      useCallStore.getState().clearInvite(current.callId, current.generation);
    });

    return () => {
      listening = false;
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
      void supabase.removeChannel(channel);
      void subscription.unsubscribe();
    };
  }, [isPreloading, terminalFencesReady, userId]);
}
