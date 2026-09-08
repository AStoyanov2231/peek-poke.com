import { after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const abortSignal = vi.hoisted(() => vi.fn());
const scheduled = vi.hoisted(() => [] as Array<() => Promise<void>>);

vi.mock("next/server", () => ({
  after: vi.fn((task: () => Promise<void>) => scheduled.push(task)),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc }),
}));

import {
  recordAvailabilityActivation,
  recordProductMetrics,
} from "@/lib/server-product-metrics";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function configureSuccessfulRpc() {
  abortSignal.mockResolvedValue({ error: null });
  rpc.mockReturnValue({ abortSignal });
}

describe("server product metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduled.splice(0);
    configureSuccessfulRpc();
  });

  it("defers a bounded discovery RPC until after the response lifecycle", async () => {
    recordProductMetrics(USER_ID, [
      { distanceKm: 1.5 },
      { distanceKm: 8 },
      { distanceKm: 20 },
      { distanceKm: 30 },
    ]);

    expect(after).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();

    await scheduled[0]();

    expect(rpc).toHaveBeenCalledWith("record_product_discovery_v1", {
      p_user_id: USER_ID,
      p_2: 1,
      p_10: 2,
      p_25: 3,
    });
    expect(abortSignal).toHaveBeenCalledOnce();
    expect(abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
  });

  it("aborts a slow RPC at the metrics timeout", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    abortSignal.mockImplementationOnce((signal: AbortSignal) => new Promise((resolve) => {
      requestSignal = signal;
      signal.addEventListener("abort", () => resolve({ error: null }), { once: true });
    }));

    recordAvailabilityActivation(USER_ID);
    const work = scheduled[0]();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(requestSignal?.aborted).toBe(true);
    await expect(work).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("swallows rejected analytics work without an unhandled promise", async () => {
    abortSignal.mockRejectedValueOnce(new Error("unavailable"));

    recordAvailabilityActivation(USER_ID);

    await expect(scheduled[0]()).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("record_product_activation_v1", {
      p_user_id: USER_ID,
      p_source: "availability",
    });
  });

  it("treats a returned RPC error as best effort and does not expose it", async () => {
    abortSignal.mockResolvedValueOnce({ error: { message: "account-specific" } });

    recordAvailabilityActivation(USER_ID);

    await expect(scheduled[0]()).resolves.toBeUndefined();
  });
});
