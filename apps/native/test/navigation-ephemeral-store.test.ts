import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/state/app-store";
import { useCallStore } from "@/state/call-store";

vi.mock("@/lib/secure-storage", () => ({
  secureStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

const peer = {
  id: "00000000-0000-4000-8000-000000000002",
  username: "peer",
  display_name: "Peer",
  avatar_url: null,
};

describe("native ephemeral stores", () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    useCallStore.getState().reset();
  });

  it("keeps drafts per thread and clears them with the signed-out reset", () => {
    const store = useAppStore.getState();
    store.setDraft("thread-1", "First draft");
    store.setDraft("thread-2", "Second draft");
    store.setActiveThreadId("thread-2");

    expect(useAppStore.getState().drafts).toEqual({
      "thread-1": "First draft",
      "thread-2": "Second draft",
    });
    expect(useAppStore.getState().activeThreadId).toBe("thread-2");

    useAppStore.getState().reset();
    expect(useAppStore.getState().drafts).toEqual({});
    expect(useAppStore.getState().activeThreadId).toBeNull();
  });

  it("moves an incoming call invite into active ephemeral call state", async () => {
    const accountId = "00000000-0000-4000-8000-000000000001";
    useCallStore.getState().observeAccount(accountId);
    const generation = useCallStore.getState().generation;
    useCallStore.getState().setIncomingInvite({
      accountId,
      generation,
      threadId: "thread-1",
      callId: "call-1",
      fromUser: peer,
      capability: "00000000-0000-4000-8000-000000000003",
      lastSequence: 1,
      expiresAt: "2026-08-08T12:00:30.000Z",
    });
    await expect(useCallStore.getState().acceptCall("call-1", generation)).resolves.toBe(true);

    expect(useCallStore.getState().incomingInvite).toBeNull();
    expect(useCallStore.getState().activeCall).toEqual({
      accountId,
      generation,
      threadId: "thread-1",
      callId: "call-1",
      peer,
      direction: "incoming",
      status: "connecting",
      capability: "00000000-0000-4000-8000-000000000003",
      lastSequence: 1,
    });

    useCallStore.getState().clearCall();
    expect(useCallStore.getState().activeCall).toBeNull();
  });
});
