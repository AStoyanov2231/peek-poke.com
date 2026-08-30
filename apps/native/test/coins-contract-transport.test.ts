import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingResponse } from "@peekpoke/shared";
import {
  activateMeetingCompletionOwner,
  fetchCoins,
  meetingPairCompleted,
  observeMeetingAuthOwner,
  recordMeeting,
  resetMeetingCompletionRegistry,
  unsubscribeMeetingAttempt,
} from "@/data/api";
import { nativeQueryKeys } from "@/data/query-keys";
import { recoverUnauthorizedSession } from "@/lib/session-recovery";

const FRIEND_ID = "22222222-2222-4222-8222-222222222222";
const OVERLAP_FRIEND_ID = "33333333-3333-4333-8333-333333333333";
const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B_ID = "44444444-4444-4444-8444-444444444444";

const recoveryMocks = vi.hoisted(() => ({
  clearNativeRealtimeAuthSession: vi.fn(async () => undefined),
  clearPersistedAuthSession: vi.fn(async () => undefined),
  clearServerState: vi.fn(),
  clearStore: vi.fn(),
  replace: vi.fn(),
  resetAppState: vi.fn(),
  resetCallState: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  stopAutoRefresh: vi.fn(async () => undefined),
  unregisterPush: vi.fn(async () => undefined),
}));

beforeEach(() => {
  recoveryMocks.unregisterPush.mockResolvedValue(undefined);
  activateMeetingCompletionOwner(ACCOUNT_ID);
});

vi.mock("@/lib/supabase", () => ({
  clearNativeRealtimeAuthSession: recoveryMocks.clearNativeRealtimeAuthSession,
  clearPersistedAuthSession: recoveryMocks.clearPersistedAuthSession,
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signOut: recoveryMocks.signOut,
      stopAutoRefresh: recoveryMocks.stopAutoRefresh,
    },
    removeAllChannels: vi.fn(async () => undefined),
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "native-meeting-key-000001" }));
vi.mock("expo-router", () => ({ router: { replace: recoveryMocks.replace } }));
vi.mock("@/data/query-client", () => ({
  clearNativeServerState: recoveryMocks.clearServerState,
}));
vi.mock("@/lib/push", () => ({
  captureCurrentPushAuth: vi.fn(() => ({ userId: ACCOUNT_ID })),
  unregisterForPushNotifications: recoveryMocks.unregisterPush,
}));
vi.mock("@/state/app-store", () => ({
  useAppStore: { getState: () => ({ reset: recoveryMocks.resetAppState }) },
}));
vi.mock("@/state/call-store", () => ({
  useCallStore: { getState: () => ({ reset: recoveryMocks.resetCallState }) },
}));

vi.mock("@/lib/env", () => ({
  env: { apiBaseUrl: "https://www.peek-poke.com" },
}));

afterEach(() => {
  resetMeetingCompletionRegistry();
  vi.unstubAllGlobals();
});

describe("native coins transports", () => {
  it.each([
    ["extra", { balance: 4, raw: true }],
    ["missing", {}],
    ["type", { balance: "4" }],
    ["semantic", { balance: -1 }],
  ])("rejects an independently %s malformed balance 2xx before caching", async (_kind, payload) => {
    vi.stubGlobal("fetch", response(payload));
    const client = clientWithoutRetries();

    await expect(client.fetchQuery({ queryKey: nativeQueryKeys.coins, queryFn: fetchCoins }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(client.getQueryData(nativeQueryKeys.coins)).toBeUndefined();
  });

  it.each([
    ["extra", { success: true, awarded: true, already_met: false, balance: 4, raw: true }],
    ["missing", { success: true, awarded: true, already_met: false }],
    ["type", { success: true, awarded: "yes", already_met: false, balance: 4 }],
    ["semantic", { success: true, awarded: true, already_met: true, balance: null }],
  ])("rejects an independently %s malformed meeting 2xx before coin/met commits", async (_kind, payload) => {
    vi.stubGlobal("fetch", response(payload));
    const client = clientWithoutRetries();
    const met = new Set<string>();

    await expect(recordMeeting(ACCOUNT_ID, FRIEND_ID).then((result) => {
      if (!result.already_met) client.setQueryData(nativeQueryKeys.coins, { balance: result.balance });
      met.add(FRIEND_ID);
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(client.getQueryData(nativeQueryKeys.coins)).toBeUndefined();
    expect(met.size).toBe(0);
    expect(meetingPairCompleted(ACCOUNT_ID, FRIEND_ID)).toBe(false);
  });

  it.each([
    [{ success: true, awarded: false, already_met: true, balance: null }],
    [{ success: true, awarded: true, already_met: false, balance: 4 }],
    [{ success: true, awarded: false, already_met: false, balance: 5 }],
  ])("accepts a valid meeting outcome %#", async (payload) => {
    const fetchMock = response(payload);
    vi.stubGlobal("fetch", fetchMock);

    await expect(recordMeeting(ACCOUNT_ID, FRIEND_ID)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.peek-poke.com/api/coins/meeting",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).get("idempotency-key"))
      .toBe("native-meeting-key-000001");
  });

  it("coalesces native background/CTA overlap and preserves the mounted absolute-balance commit", async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    const client = clientWithoutRetries();
    const backgroundCommit = vi.fn((result: { balance: number }) => {
      client.setQueryData(nativeQueryKeys.coins, { balance: result.balance });
    });
    const ctaCommit = vi.fn((result: { balance: number }) => {
      client.setQueryData(nativeQueryKeys.coins, { balance: result.balance });
    });

    const background = recordMeeting(
      ACCOUNT_ID,
      OVERLAP_FRIEND_ID,
      undefined,
      backgroundCommit,
      "native-background-meeting:test",
    );
    const cta = recordMeeting(
      ACCOUNT_ID,
      OVERLAP_FRIEND_ID,
      undefined,
      ctaCommit,
      "native-chat-meeting:test",
    );
    unsubscribeMeetingAttempt(ACCOUNT_ID, OVERLAP_FRIEND_ID, "native-background-meeting:test");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    resolve(new Response(JSON.stringify({
      success: true,
      awarded: true,
      already_met: false,
      balance: 4,
    })));

    await expect(Promise.all([background, cta])).resolves.toHaveLength(2);
    expect(backgroundCommit).not.toHaveBeenCalled();
    expect(ctaCommit).toHaveBeenCalledOnce();
    expect(client.getQueryData(nativeQueryKeys.coins)).toEqual({ balance: 4 });
  });

  it.each([
    ["background", "cta"],
    ["cta", "background"],
  ] as const)(
    "survives a capped-wallet native screen remount for %s/%s order without a second request",
    async (...order) => {
      let resolve!: (response: Response) => void;
      const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
      vi.stubGlobal("fetch", fetchMock);
      const client = clientWithoutRetries();
      const commit = (result: MeetingResponse) => {
        if (!result.already_met) {
          client.setQueryData(nativeQueryKeys.coins, { balance: result.balance });
        }
      };
      const runBackgroundCycle = () => {
        if (meetingPairCompleted(ACCOUNT_ID, OVERLAP_FRIEND_ID)) return Promise.resolve(null);
        return recordMeeting(
          ACCOUNT_ID,
          OVERLAP_FRIEND_ID,
          undefined,
          commit,
          "native-background-meeting:capped",
        );
      };
      const runCta = () => recordMeeting(
        ACCOUNT_ID,
        OVERLAP_FRIEND_ID,
        undefined,
        commit,
        "native-chat-meeting:capped",
      );

      const firstCycle = order.map((consumer) => (
        consumer === "background" ? runBackgroundCycle() : runCta()
      ));
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      resolve(new Response(JSON.stringify({
        success: true,
        awarded: false,
        already_met: false,
        balance: 5,
      })));
      await Promise.all(firstCycle);
      expect(meetingPairCompleted(ACCOUNT_ID, OVERLAP_FRIEND_ID)).toBe(true);
      // A new detector instance after screen remount consults the app-lifecycle registry.
      await runBackgroundCycle();
      const remountedCta = await recordMeeting(
        ACCOUNT_ID,
        OVERLAP_FRIEND_ID,
        undefined,
        commit,
        "native-chat-meeting:remounted",
      );

      expect(fetchMock).toHaveBeenCalledOnce();
      const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(new Headers(options.headers).get("idempotency-key"))
        .toBe("native-meeting-key-000001");
      expect(remountedCta).toEqual({
        success: true,
        awarded: false,
        already_met: true,
        balance: null,
      });
      expect(client.getQueryData(nativeQueryKeys.coins)).toEqual({ balance: 5 });
    },
  );

  it("fences a deferred native CTA/background response on direct unauthorized recovery before resolve", async () => {
    const resolvers: ((response: Response) => void)[] = [];
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolvers.push(done); }));
    vi.stubGlobal("fetch", fetchMock);
    const client = clientWithoutRetries();
    const staleCommit = vi.fn((result: MeetingResponse) => {
      if (!result.already_met) client.setQueryData(nativeQueryKeys.coins, { balance: result.balance });
    });
    const currentCommit = vi.fn((result: MeetingResponse) => {
      if (!result.already_met) client.setQueryData(nativeQueryKeys.coins, { balance: result.balance });
    });

    const background = recordMeeting(
      ACCOUNT_ID,
      OVERLAP_FRIEND_ID,
      undefined,
      staleCommit,
      "native-background-meeting:stale-epoch",
    );
    const cta = recordMeeting(
      ACCOUNT_ID,
      OVERLAP_FRIEND_ID,
      undefined,
      staleCommit,
      "native-chat-meeting:stale-epoch",
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const pushCleanup = deferredSignal();
    recoveryMocks.unregisterPush.mockReturnValueOnce(pushCleanup.promise);
    const recovery = recoverUnauthorizedSession();
    // A later SIGNED_OUT callback repeats teardown without changing the fenced outcome.
    observeMeetingAuthOwner(null);
    await expect(recordMeeting(
      ACCOUNT_ID,
      OVERLAP_FRIEND_ID,
      undefined,
      vi.fn(),
      "native-chat-meeting:stale-after-unauthorized",
    )).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolvers[0]?.(meetingResponse(4));

    await expect(Promise.all([background, cta])).rejects.toMatchObject({
      name: "AbortError",
      code: "MEETING_ATTEMPT_STALE",
    });
    expect(meetingPairCompleted(ACCOUNT_ID, OVERLAP_FRIEND_ID)).toBe(false);
    expect(staleCommit).not.toHaveBeenCalled();
    expect(client.getQueryData(nativeQueryKeys.coins)).toBeUndefined();

    pushCleanup.resolve();
    await recovery;
    observeMeetingAuthOwner(ACCOUNT_ID);
    const retry = recordMeeting(
      ACCOUNT_ID,
      OVERLAP_FRIEND_ID,
      undefined,
      currentCommit,
      "native-chat-meeting:current-epoch",
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolvers[1]?.(meetingResponse(6));
    await expect(retry).resolves.toMatchObject({ balance: 6 });
    expect(currentCommit).toHaveBeenCalledOnce();
    expect(meetingPairCompleted(ACCOUNT_ID, OVERLAP_FRIEND_ID)).toBe(true);
    expect(client.getQueryData(nativeQueryKeys.coins)).toEqual({ balance: 6 });
  });

  it("fences deferred A on a native bootstrap A to B to A transition without a B meeting", async () => {
    const resolvers: ((response: Response) => void)[] = [];
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolvers.push(done); }));
    vi.stubGlobal("fetch", fetchMock);
    const staleACommit = vi.fn();
    const currentACommit = vi.fn();

    const staleA = recordMeeting(ACCOUNT_ID, FRIEND_ID, undefined, staleACommit, "a-old");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const realtimeAuth = deferredSignal();
    const authTransition = (async () => {
      observeMeetingAuthOwner(ACCOUNT_B_ID);
      await realtimeAuth.promise;
    })();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(recordMeeting(ACCOUNT_ID, FRIEND_ID, undefined, vi.fn(), "a-stale-ui"))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolvers[0]?.(meetingResponse(1));
    await expect(staleA).rejects.toMatchObject({ name: "AbortError" });
    expect(staleACommit).not.toHaveBeenCalled();
    expect(meetingPairCompleted(ACCOUNT_B_ID, FRIEND_ID)).toBe(false);

    realtimeAuth.resolve();
    await authTransition;
    observeMeetingAuthOwner(ACCOUNT_ID);
    const currentA = recordMeeting(ACCOUNT_ID, FRIEND_ID, undefined, currentACommit, "a-current");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolvers[1]?.(meetingResponse(3));
    await expect(currentA).resolves.toMatchObject({ balance: 3 });
    expect(currentACommit).toHaveBeenCalledOnce();
    expect(meetingPairCompleted(ACCOUNT_ID, FRIEND_ID)).toBe(true);
  });

  it("keeps a deferred native meeting current across an idempotent same-user token refresh", async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    const commit = vi.fn();

    observeMeetingAuthOwner(ACCOUNT_ID);
    const request = recordMeeting(ACCOUNT_ID, FRIEND_ID, undefined, commit, "same-user-refresh");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    observeMeetingAuthOwner(ACCOUNT_ID);
    observeMeetingAuthOwner(ACCOUNT_ID);
    resolve(meetingResponse(7));

    await expect(request).resolves.toMatchObject({ balance: 7 });
    expect(commit).toHaveBeenCalledOnce();
    expect(meetingPairCompleted(ACCOUNT_ID, FRIEND_ID)).toBe(true);
  });

  it("fences a cached native preflight before its synthetic response can commit", async () => {
    vi.stubGlobal("fetch", response({
      success: true,
      awarded: false,
      already_met: false,
      balance: 5,
    }));
    await recordMeeting(ACCOUNT_ID, FRIEND_ID);
    const commit = vi.fn();

    const cached = recordMeeting(ACCOUNT_ID, FRIEND_ID, undefined, commit, "cached-owner");
    observeMeetingAuthOwner(ACCOUNT_B_ID);

    await expect(cached).rejects.toMatchObject({ name: "AbortError" });
    expect(commit).not.toHaveBeenCalled();
  });

  it("rejects cold-start and mismatched native callers until auth explicitly activates them", async () => {
    const fetchMock = response({
      success: true,
      awarded: false,
      already_met: false,
      balance: 8,
    });
    vi.stubGlobal("fetch", fetchMock);
    observeMeetingAuthOwner(null);

    await expect(recordMeeting(ACCOUNT_ID, FRIEND_ID)).rejects.toMatchObject({
      name: "AbortError",
      code: "MEETING_ATTEMPT_STALE",
    });
    expect(meetingPairCompleted(ACCOUNT_ID, FRIEND_ID)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    const initialRealtime = deferredSignal();
    const initialBootstrap = (async () => {
      observeMeetingAuthOwner(ACCOUNT_ID);
      await initialRealtime.promise;
    })();
    await expect(recordMeeting(ACCOUNT_B_ID, FRIEND_ID)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(recordMeeting(ACCOUNT_ID, FRIEND_ID)).resolves.toMatchObject({ balance: 8 });
    initialRealtime.resolve();
    await initialBootstrap;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(meetingPairCompleted(ACCOUNT_ID, FRIEND_ID)).toBe(true);
  });
});

function response(payload: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(payload), {
    headers: { "x-request-id": "coins-native-request" },
  }));
}

function meetingResponse(balance: number) {
  return new Response(JSON.stringify({
    success: true,
    awarded: false,
    already_met: false,
    balance,
  }));
}

function deferredSignal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function clientWithoutRetries() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
