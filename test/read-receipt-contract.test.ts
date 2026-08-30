import { describe, expect, it, vi } from "vitest";
import {
  createReadReceiptCoordinator,
  readReceiptResponseSchema,
} from "@peekpoke/shared";

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
const THREAD_A = "33333333-3333-4333-8333-333333333333";
const THREAD_B = "44444444-4444-4444-8444-444444444444";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("read receipt contract and lifecycle coordinator", () => {
  it("accepts only the exact safe canonical response", () => {
    const valid = { success: true, last_read_sequence: 7 } as const;
    expect(readReceiptResponseSchema.parse(valid)).toEqual(valid);
    for (const invalid of [
      { success: true },
      { success: true, last_read_sequence: "7" },
      { success: true, last_read_sequence: -1 },
      { success: true, last_read_sequence: Number.MAX_SAFE_INTEGER + 1 },
      { success: true, last_read_sequence: 7, extra: true },
    ]) {
      expect(readReceiptResponseSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("coalesces duplicate active reads and permits retry after a lost response", async () => {
    const coordinator = createReadReceiptCoordinator();
    coordinator.observeAccount(ACCOUNT_A);
    const token = coordinator.activateThread(ACCOUNT_A, THREAD_A)!;
    const pending = deferred<number>();
    const deliver = vi.fn(() => pending.promise);

    const first = coordinator.run(token, deliver);
    const duplicate = coordinator.run(token, deliver);
    expect(duplicate).toBe(first);
    await vi.waitFor(() => {
      expect(deliver).toHaveBeenCalledOnce();
    });
    pending.resolve(7);
    await expect(first).resolves.toBe(7);

    const lost = new Error("response lost");
    await expect(coordinator.run(token, async () => { throw lost; })).rejects.toBe(lost);
    await expect(coordinator.run(token, async () => 8)).resolves.toBe(8);
  });

  it("fences late thread switches, account switches, and signout", async () => {
    const coordinator = createReadReceiptCoordinator();
    coordinator.observeAccount(ACCOUNT_A);
    const tokenA = coordinator.activateThread(ACCOUNT_A, THREAD_A)!;
    const pendingA = deferred<number>();
    const staleA = coordinator.run(tokenA, () => pendingA.promise);

    const tokenB = coordinator.activateThread(ACCOUNT_A, THREAD_B)!;
    pendingA.resolve(7);
    await expect(staleA).rejects.toMatchObject({
      name: "AbortError",
      code: "READ_RECEIPT_STALE",
    });
    await expect(coordinator.run(tokenA, async () => 1)).rejects.toMatchObject({ name: "AbortError" });
    await expect(coordinator.run(tokenB, async () => 8)).resolves.toBe(8);

    coordinator.observeAccount(ACCOUNT_B);
    await expect(coordinator.run(tokenB, async () => 9)).rejects.toMatchObject({ name: "AbortError" });
    expect(coordinator.activateThread(ACCOUNT_A, THREAD_A)).toBeNull();
    const tokenForB = coordinator.activateThread(ACCOUNT_B, THREAD_A)!;
    coordinator.observeAccount(null);
    await expect(coordinator.run(tokenForB, async () => 10)).rejects.toMatchObject({ name: "AbortError" });
  });
});
