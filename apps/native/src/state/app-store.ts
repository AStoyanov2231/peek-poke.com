import { create } from "zustand";

type AppState = {
  drafts: Record<string, string>;
  activeThreadId: string | null;
  setDraft: (threadId: string, draft: string) => void;
  setActiveThreadId: (threadId: string | null) => void;
  reset: () => void;
};

const initial = {
  drafts: {},
  activeThreadId: null,
};

export const useAppStore = create<AppState>((set) => ({
  ...initial,
  setDraft: (threadId, draft) =>
    set((state) => ({ drafts: { ...state.drafts, [threadId]: draft } })),
  setActiveThreadId: (activeThreadId) => set({ activeThreadId }),
  reset: () => set(initial),
}));
