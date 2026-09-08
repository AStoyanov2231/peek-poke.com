import { createElement, useLayoutEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PokeInboxItem } from "@peekpoke/shared";
import {
  pendingReceivedPokes,
  usePendingPokes,
  usePendingReceivedPokes,
} from "@/hooks/use-pending-received-pokes";

const NOW = Date.parse("2026-09-08T10:00:00.000Z");
const ACTOR = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";

function poke(id: string, expiresAt: number, status: PokeInboxItem["status"] = "pending"): PokeInboxItem {
  return {
    id,
    senderId: PEER,
    recipientId: ACTOR,
    activity: "coffee",
    customLabel: null,
    note: null,
    status,
    expiresAt: new Date(expiresAt).toISOString(),
    createdAt: new Date(NOW - 1_000).toISOString(),
    respondedAt: null,
    threadId: null,
    sender: {
      id: PEER,
      username: "peer",
      display_name: "Peer",
      avatar_url: null,
    },
  };
}

const visible = { current: [] as PokeInboxItem[] };
let renderer: ReactTestRenderer | null = null;

function Harness({ pokes }: { pokes: PokeInboxItem[] }) {
  const pending = usePendingReceivedPokes(pokes);
  useLayoutEffect(() => { visible.current = pending; });
  return null;
}

describe("pending received Pokes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    visible.current = [];
  });

  afterEach(async () => {
    await act(async () => { renderer?.unmount(); });
    renderer = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("counts only pending Pokes that have not expired", () => {
    const pokes = [
      poke("future", NOW + 1_000),
      poke("expired", NOW - 1),
      poke("accepted", NOW + 1_000, "accepted"),
    ];

    expect(pendingReceivedPokes(pokes, NOW).map(({ id }) => id)).toEqual(["future"]);
  });

  it("removes a cached Poke at expiry without a network refresh", async () => {
    await act(async () => { renderer = create(createElement(Harness, { pokes: [poke("future", NOW + 1_000)] })); });
    expect(visible.current.map(({ id }) => id)).toEqual(["future"]);

    await act(async () => { await vi.advanceTimersByTimeAsync(1_001); });
    expect(visible.current).toEqual([]);
  });
  it("expires cached sent Pokes with the same timer as received Pokes", async () => {
    function CombinedHarness({ pokes }: { pokes: PokeInboxItem[] }) {
      const pending = usePendingPokes(pokes);
      useLayoutEffect(() => { visible.current = pending; });
      return null;
    }

    await act(async () => {
      renderer = create(createElement(CombinedHarness, {
        pokes: [poke("received", NOW + 2_000), poke("sent", NOW + 1_000)],
      }));
    });
    expect(visible.current.map(({ id }) => id)).toEqual(["received", "sent"]);

    await act(async () => { await vi.advanceTimersByTimeAsync(1_001); });
    expect(visible.current.map(({ id }) => id)).toEqual(["received"]);
  });

});
