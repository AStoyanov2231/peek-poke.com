import { describe, expect, it } from "vitest";
import { createChatMessageUiLifecycle } from "@peekpoke/shared";

describe(`native chat UI lifecycle (${process.env.NATIVE_TEST_PLATFORM ?? "shared"})`, () => {
  it("ignores late thread A success, error, and finally effects after thread B starts", () => {
    const lifecycle = createChatMessageUiLifecycle();
    const threadAToken = lifecycle.begin()!;
    const threadBUi = {
      alerts: 0,
      cacheCommits: 0,
      draft: "Thread B draft",
      pendingMedia: true,
      sending: true,
    };

    lifecycle.reset();
    const threadBToken = lifecycle.begin()!;
    lifecycle.commitOnce(threadAToken, "thread-a-message", () => {
      threadBUi.cacheCommits += 1;
      threadBUi.draft = "";
      threadBUi.pendingMedia = false;
    });
    lifecycle.commitOnce(threadAToken, threadAToken.nonce, () => {
      threadBUi.alerts += 1;
    });
    lifecycle.runIfCurrent(threadAToken, () => {
      threadBUi.sending = false;
    });

    expect(threadBUi).toEqual({
      alerts: 0,
      cacheCommits: 0,
      draft: "Thread B draft",
      pendingMedia: true,
      sending: true,
    });
    expect(lifecycle.isGenerationCurrent(threadAToken)).toBe(false);
    expect(lifecycle.isCurrent(threadBToken)).toBe(true);
  });

  it("commits duplicate edit success once and permits failure then retry", () => {
    const lifecycle = createChatMessageUiLifecycle();
    const effects = { alerts: 0, editCommits: 0, sendCommits: 0 };

    const editToken = lifecycle.begin()!;
    lifecycle.commitOnce(editToken, editToken.nonce, () => {
      effects.editCommits += 1;
    });
    lifecycle.commitOnce(editToken, editToken.nonce, () => {
      effects.editCommits += 1;
    });
    lifecycle.end(editToken);

    const failureToken = lifecycle.begin()!;
    lifecycle.commitOnce(failureToken, failureToken.nonce, () => {
      effects.alerts += 1;
    });
    lifecycle.end(failureToken);

    const retryToken = lifecycle.begin()!;
    lifecycle.commitOnce(retryToken, "same-client-id", () => {
      effects.sendCommits += 1;
    });
    lifecycle.end(retryToken);

    expect(effects).toEqual({ alerts: 1, editCommits: 1, sendCommits: 1 });
  });

  it("rejects callbacks immediately after native owner teardown without reset", () => {
    let currentOwner: string | null = "thread-a:user-a";
    const lifecycle = createChatMessageUiLifecycle(() => currentOwner);
    const threadAToken = lifecycle.begin()!;
    const effects = { alerts: 0, cacheCommits: 0, pendingClears: 0 };

    currentOwner = null;
    lifecycle.commitOnce(threadAToken, "thread-a-message", () => {
      effects.cacheCommits += 1;
    });
    lifecycle.commitOnce(threadAToken, threadAToken.nonce, () => {
      effects.alerts += 1;
    });
    lifecycle.runIfCurrent(threadAToken, () => {
      effects.pendingClears += 1;
    });

    currentOwner = "thread-b:user-a";
    expect(lifecycle.begin()).not.toBeNull();
    expect(effects).toEqual({ alerts: 0, cacheCommits: 0, pendingClears: 0 });
  });
});
