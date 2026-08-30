"use client";

import { create } from "zustand";
import { COIN_SPENT_ANIMATION_MS } from "@/lib/constants";
import type { DMThread, Friendship, Profile } from "@/types/database";

export type DMThreadWithParticipants = DMThread & {
  type: "dm";
  participant_1: Profile;
  participant_2: Profile;
  unread_count?: number;
};

export type Thread = DMThreadWithParticipants;
export type FriendshipWithRequester = Friendship & { requester: Profile };
export type FriendshipWithAddressee = Friendship & { addressee: Profile };
export type FriendWithFriendshipId = Profile & { friendship_id: string };

interface AppState {
  drafts: Record<string, string>;
  activeThreadId: string | null;
  coinSpent: boolean;
  coinSpentCount: number;
  setDraft: (threadId: string, text: string) => void;
  setActiveThreadId: (threadId: string | null) => void;
  triggerCoinSpent: () => void;
  clearStore: () => void;
}

const initialState = {
  drafts: {},
  activeThreadId: null,
  coinSpent: false,
  coinSpentCount: 0,
};

let coinSpentTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppState>((set) => ({
  ...initialState,
  setDraft: (threadId, text) =>
    set((state) => {
      const drafts = { ...state.drafts };
      if (text) drafts[threadId] = text;
      else delete drafts[threadId];
      return { drafts };
    }),
  setActiveThreadId: (activeThreadId) => set({ activeThreadId }),
  triggerCoinSpent: () => {
    if (coinSpentTimer) clearTimeout(coinSpentTimer);
    set((state) => ({
      coinSpent: true,
      coinSpentCount: state.coinSpentCount + 1,
    }));
    coinSpentTimer = setTimeout(() => {
      set({ coinSpent: false });
      coinSpentTimer = null;
    }, COIN_SPENT_ANIMATION_MS);
  },
  clearStore: () => {
    if (coinSpentTimer) {
      clearTimeout(coinSpentTimer);
      coinSpentTimer = null;
    }
    set(initialState);
  },
}));
