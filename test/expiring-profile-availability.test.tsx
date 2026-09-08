import { createElement, useLayoutEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Availability } from "@peekpoke/shared";
import { useExpiringAvailability } from "@/features/profile/useExpiringAvailability";

const NOW = Date.parse("2026-09-08T10:00:00.000Z");
const availability: Availability = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  activity: "coffee",
  customLabel: null,
  expiresAt: new Date(NOW + 1_000).toISOString(),
  createdAt: new Date(NOW - 1_000).toISOString(),
  updatedAt: new Date(NOW - 1_000).toISOString(),
};

const ref = { current: null as Availability | null };
const refresh = vi.fn<() => Promise<unknown>>();
let renderer: ReactTestRenderer | null = null;

function Harness() {
  const visible = useExpiringAvailability(availability, refresh);
  useLayoutEffect(() => { ref.current = visible; });
  return null;
}

describe("expiring profile availability", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    refresh.mockReset();
    refresh.mockRejectedValue(new Error("offline"));
    ref.current = null;
  });

  afterEach(async () => {
    await act(async () => { renderer?.unmount(); });
    renderer = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("hides cached availability at expiry even when the background refresh rejects", async () => {
    await act(async () => { renderer = create(createElement(Harness)); });
    expect(ref.current?.activity).toBe("coffee");

    await act(async () => { await vi.advanceTimersByTimeAsync(1_050); });
    expect(refresh).toHaveBeenCalledOnce();
    expect(ref.current).toBeNull();
  });
});
