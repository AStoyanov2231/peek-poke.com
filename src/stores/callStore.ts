"use client";
import { create } from "zustand";
import type { CallPeerInfo } from "@/lib/webrtc/signaling";

export type CallStatus =
  | "calling"       // outgoing: sent invite, waiting for accept
  | "connecting"    // offer/answer in progress
  | "connected"     // call live
  | "ended"         // gracefully ended
  | "failed";       // media or signaling error

export type CallDirection = "outgoing" | "incoming";

export type ActiveCall = {
  threadId: string;
  callId: string;
  peer: CallPeerInfo;
  direction: CallDirection;
  status: CallStatus;
};

export type IncomingInvite = {
  threadId: string;
  callId: string;
  fromUser: CallPeerInfo;
};

interface CallStore {
  activeCall: ActiveCall | null;
  incomingInvite: IncomingInvite | null;

  /** Start an outgoing call — renders CallView immediately */
  startOutgoingCall: (threadId: string, callId: string, peer: CallPeerInfo) => void;
  /** Set pending incoming invite — renders IncomingCallOverlay */
  setIncomingInvite: (invite: IncomingInvite) => void;
  /** Accept the pending invite — moves it to activeCall (incoming direction) */
  acceptCall: () => void;
  /** Decline the pending invite — clears it (caller is notified by server) */
  declineCall: () => void;
  /** Update status of the active call (called by useWebRTCCall) */
  setCallStatus: (status: CallStatus) => void;
  /** Tear down the active call — unmounts CallView */
  clearCall: () => void;
  /** Clear a pending invite without accepting */
  clearInvite: () => void;
}

export const useCallStore = create<CallStore>((set, get) => ({
  activeCall: null,
  incomingInvite: null,

  startOutgoingCall: (threadId, callId, peer) =>
    set({
      activeCall: { threadId, callId, peer, direction: "outgoing", status: "calling" },
      incomingInvite: null,
    }),

  setIncomingInvite: (invite) => set({ incomingInvite: invite }),

  acceptCall: () => {
    const { incomingInvite } = get();
    if (!incomingInvite) return;
    set({
      activeCall: {
        threadId: incomingInvite.threadId,
        callId: incomingInvite.callId,
        peer: incomingInvite.fromUser,
        direction: "incoming",
        status: "connecting",
      },
      incomingInvite: null,
    });
  },

  declineCall: () => set({ incomingInvite: null }),

  setCallStatus: (status) =>
    set((state) => ({
      activeCall: state.activeCall ? { ...state.activeCall, status } : null,
    })),

  clearCall: () => set({ activeCall: null }),

  clearInvite: () => set({ incomingInvite: null }),
}));
