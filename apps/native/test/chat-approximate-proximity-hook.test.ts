import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, useLayoutEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const nearbyFetch = vi.hoisted(() => vi.fn());

vi.mock("@/data/discovery/queries", () => ({
  nearbyQueryOptions: (coords: { lat: number; lng: number }, viewerId: string) => ({
    queryKey: ["discovery", "nearby", viewerId, coords.lat, coords.lng],
    queryFn: () => nearbyFetch(),
  }),
}));
vi.mock("@/data/discovery/location-sync", () => ({
  locationIsFreshForDiscovery: () => true,
}));
vi.mock("@/data/pokes", () => ({
  fetchPokes: async () => ({
    received: [{ senderId: PEER, recipientId: ACTOR, status: "accepted" }],
    sent: [],
  }),
}));
vi.mock("@/data/social/queries", () => ({
  socialQuery: () => ({
    queryKey: ["social", "friends"],
    queryFn: async () => ({ friends: [], requests: [], sentRequests: [], sentRequestUserIds: [] }),
  }),
}));
vi.mock("@/lib/location", () => ({
  useDeviceLocation: () => ({
    coords: { lat: 42.7, lng: 23.32 },
    status: "granted",
    error: null,
    failureForUserId: null,
    freshForUserId: ACTOR,
    acknowledgedAt: Date.now(),
  }),
}));

import { useChatApproximateProximity } from "@/hooks/use-chat-approximate-proximity";

const visible = { current: false };
let renderer: ReactTestRenderer | null = null;
let client: QueryClient | null = null;

function Probe() {
  const isVisible = useChatApproximateProximity(ACTOR, PEER);
  useLayoutEffect(() => { visible.current = isVisible; });
  return null;
}

async function flush() {
  // Query notifications commit first; the hook then schedules its clock
  // update from that committed result. Advance both event-loop turns.
  for (let turn = 0; turn < 2; turn += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
  }
}

describe("useChatApproximateProximity", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-09-08T12:00:00.000Z") });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    nearbyFetch.mockReset();
    visible.current = false;
    client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  });

  afterEach(async () => {
    await act(async () => { renderer?.unmount(); });
    renderer = null;
    client?.clear();
    client = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows only after the nearby query resolves, then hides a retained cached peer when refresh fails", async () => {
    let resolveNearby: ((value: Array<{ userId: string }>) => void) | null = null;
    nearbyFetch.mockImplementationOnce(() => new Promise((resolve) => { resolveNearby = resolve; }));

    await act(async () => {
      renderer = create(createElement(
        QueryClientProvider,
        { client: client! },
        createElement(Probe),
      ));
    });
    expect(visible.current).toBe(false);

    // Resolution must happen after mount so an incorrectly captured initial
    // clock cannot accidentally match React Query's dataUpdatedAt.
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { resolveNearby?.([{ userId: PEER }]); });
    await flush();
    expect(client!.getQueryData(["discovery", "nearby", ACTOR, 42.7, 23.32])).toEqual([{ userId: PEER }]);
    expect(client!.getQueryData(["social", "friends"])).toBeTruthy();
    expect(client!.getQueryData(["chat", "approximate-proximity", "pokes", ACTOR])).toBeTruthy();
    expect(visible.current).toBe(true);

    nearbyFetch.mockRejectedValueOnce(new Error("nearby refresh failed"));
    await act(async () => {
      await client!.invalidateQueries({ queryKey: ["discovery", "nearby"] });
    });
    await flush();

    expect(client!.getQueryData(["discovery", "nearby", ACTOR, 42.7, 23.32])).toEqual([{ userId: PEER }]);
    expect(visible.current).toBe(false);
  });
});
