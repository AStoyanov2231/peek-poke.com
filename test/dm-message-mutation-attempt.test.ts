import { describe, expect, it, vi } from "vitest";
import {
  createDmMessageMutationCoordinator,
  type DmMessageMutationAttempt,
} from "@peekpoke/shared";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const MESSAGE = "33333333-3333-4333-8333-333333333333";
const OTHER_MESSAGE = "44444444-4444-4444-8444-444444444444";
const FIRST_KEY = "55555555-5555-4555-8555-555555555555";
const SECOND_KEY = "66666666-6666-4666-8666-666666666666";

const scope = { accountId: ACCOUNT, threadId: THREAD, messageId: MESSAGE };

describe("DM message mutation attempts", () => {
  it("reuses the exact edit key and normalized payload after response loss", async () => {
    const ids = [FIRST_KEY, SECOND_KEY];
    const coordinator = createDmMessageMutationCoordinator(() => ids.shift()!);
    const delivered: DmMessageMutationAttempt[] = [];
    const deliver = vi.fn(async (attempt: DmMessageMutationAttempt) => {
      delivered.push(attempt);
      if (delivered.length === 1) throw new TypeError("response lost after commit");
      return { messageId: attempt.scope.messageId };
    });

    await expect(coordinator.run(scope, { kind: "edit", content: "  hello  " }, deliver))
      .rejects.toThrow("response lost");
    await expect(coordinator.run(scope, { kind: "edit", content: "hello" }, deliver))
      .resolves.toEqual({ messageId: MESSAGE });

    expect(deliver).toHaveBeenCalledTimes(2);
    expect(delivered[0].idempotencyKey).toBe(FIRST_KEY);
    expect(delivered[1]).toBe(delivered[0]);
    expect(delivered[0].mutation).toEqual({ kind: "edit", content: "hello" });
    expect(coordinator.peek()).toBeNull();
  });

  it("coalesces concurrent delete delivery and preserves its generation fence", async () => {
    const coordinator = createDmMessageMutationCoordinator(() => FIRST_KEY);
    let release!: () => void;
    const deliver = vi.fn(() => new Promise<string>((resolve) => {
      release = () => resolve("deleted");
    }));

    const first = coordinator.run(scope, { kind: "delete" }, deliver);
    const attempt = coordinator.peek()!;
    const second = coordinator.run(scope, { kind: "delete" }, deliver);
    await Promise.resolve();

    expect(second).toBe(first);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(coordinator.isGenerationCurrent(attempt)).toBe(true);
    release();
    await expect(first).resolves.toBe("deleted");
    expect(coordinator.isGenerationCurrent(attempt)).toBe(true);
  });

  it("fences late account/thread/message generations and allocates a new key for changed work", async () => {
    const ids = [FIRST_KEY, SECOND_KEY];
    const coordinator = createDmMessageMutationCoordinator(() => ids.shift()!);
    await expect(coordinator.run(scope, { kind: "edit", content: "first" }, async () => {
      throw new Error("offline");
    })).rejects.toThrow("offline");
    const stale = coordinator.peek()!;

    const replacement = coordinator.prepare(
      { ...scope, messageId: OTHER_MESSAGE },
      { kind: "delete" },
    );

    expect(replacement.idempotencyKey).toBe(SECOND_KEY);
    expect(coordinator.isGenerationCurrent(stale)).toBe(false);
    expect(coordinator.isGenerationCurrent(replacement)).toBe(true);
    expect(coordinator.cancel()).toBe(true);
    expect(coordinator.isGenerationCurrent(replacement)).toBe(false);
  });
});
