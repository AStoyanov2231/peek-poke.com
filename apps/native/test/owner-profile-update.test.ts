import { onlineManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateProfile } from "@/data/profile/api";
import {
  commitNativeOwnerProfileUpdate,
  refreshNativeProfileReferences,
  refreshNativeOwnerProfileReferences,
} from "@/data/profile/cache";
import { nativeQueryKeys } from "@/data/query-keys";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-08-07T10:00:00.000Z";
const profile = {
  id: USER_ID,
  username: "owner",
  display_name: "Élodie 🌈",
  bio: "Hello",
  avatar_url: null,
  cover_image_url: null,
  location_text: null,
  is_online: true,
  last_seen_at: timestamp,
  created_at: timestamp,
  onboarding_completed: true,
  roles: ["user" as const],
};

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));
vi.mock("@/lib/env", () => ({
  env: {
    apiBaseUrl: "https://www.peek-poke.com",
    supabaseUrl: "https://project.supabase.co",
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});

describe("native iOS/Android owner profile transport", () => {
  it("sends canonical Unicode and accepts the strict response", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ display_name: "Élodie 🌈" });
      return jsonResponse({ profile });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateProfile({ display_name: "  E\u0301lodie 🌈  " })).resolves.toEqual(profile);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://www.peek-poke.com/api/profile");
  });

  it.each([
    ["null profile", { profile: null }],
    ["extra field", { profile: { ...profile, secret: "leak" } }],
    ["noncanonical name", { profile: { ...profile, display_name: " Ada " } }],
  ])("rejects invalid 2xx %s before native cache commit", async (_label, payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(payload)));
    await expect(updateProfile({ display_name: "Ada" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
  });

  it("surfaces offline failure and preserves user cancellation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(updateProfile({ display_name: "Ada" })).rejects.toMatchObject({
      code: "NETWORK_UNAVAILABLE",
    });

    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) {
        reject(init.signal.reason);
        return;
      }
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));
    const pending = updateProfile({ display_name: "Ada" }, controller.signal);
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("native owner profile cache commit", () => {
  it("commits only the current account and invalidates only cached views containing it", async () => {
    const client = new QueryClient();
    client.setQueryData(nativeQueryKeys.profile.current, { ...profile, display_name: "Old" });
    client.setQueryData(nativeQueryKeys.profile.public(USER_ID), {
      profile: { id: USER_ID, display_name: "Old", bio: "Old" },
    });
    const dependentKeys = [
      nativeQueryKeys.social.friends,
      nativeQueryKeys.inbox.threads,
      ["discovery", "nearby", USER_ID] as const,
      [...nativeQueryKeys.discovery.userSearch, "ada", "|", USER_ID] as const,
    ];
    client.setQueryData(nativeQueryKeys.social.friends, [{
      requester_id: USER_ID,
      addressee_id: OTHER_ID,
    }]);
    client.setQueryData(nativeQueryKeys.social.requests, [{
      requester_id: OTHER_ID,
      addressee_id: "33333333-3333-4333-8333-333333333333",
    }]);
    client.setQueryData(nativeQueryKeys.inbox.threads, {
      threads: [{ participant_1_id: USER_ID, participant_2_id: OTHER_ID }],
    });
    client.setQueryData(dependentKeys[2], [{ userId: USER_ID }]);
    client.setQueryData(dependentKeys[3], [{ id: USER_ID }]);

    expect(commitNativeOwnerProfileUpdate(client, USER_ID, profile)).toBe(true);
    expect(client.getQueryData(nativeQueryKeys.profile.current)).toEqual(profile);
    expect(client.getQueryData<{ profile: { display_name: string } }>(nativeQueryKeys.profile.public(USER_ID))?.profile.display_name).toBe("Élodie 🌈");
    await refreshNativeOwnerProfileReferences(client, USER_ID);
    dependentKeys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    expect(client.getQueryState(nativeQueryKeys.social.requests)?.isInvalidated).toBe(false);
  });

  it("fences account switches and mismatched response owners", () => {
    const client = new QueryClient();
    client.setQueryData(nativeQueryKeys.profile.current, { ...profile, id: OTHER_ID });
    expect(commitNativeOwnerProfileUpdate(client, USER_ID, profile)).toBe(false);
    client.setQueryData(nativeQueryKeys.profile.current, profile);
    expect(commitNativeOwnerProfileUpdate(client, USER_ID, { ...profile, id: OTHER_ID })).toBe(false);
  });

  it("invalidates the search prefix and refetches every active search variant", async () => {
    onlineManager.setOnline(true);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(nativeQueryKeys.profile.current, profile);
    const firstKey = [...nativeQueryKeys.discovery.userSearch, "ada", "|", USER_ID] as const;
    const secondKey = [...nativeQueryKeys.discovery.userSearch, "elo", "tag-1", "|", USER_ID] as const;
    const firstFetch = vi.fn(async () => [{ id: USER_ID, display_name: "Élodie 🌈" }]);
    const secondFetch = vi.fn(async () => [{ id: USER_ID, display_name: "Élodie 🌈" }]);
    client.setQueryData(firstKey, [{ id: USER_ID, display_name: "Old" }]);
    client.setQueryData(secondKey, [{ id: OTHER_ID, display_name: "Other" }]);
    const firstObserver = new QueryObserver(client, { queryKey: firstKey, queryFn: firstFetch, staleTime: Infinity });
    const secondObserver = new QueryObserver(client, { queryKey: secondKey, queryFn: secondFetch, staleTime: Infinity });
    const unsubscribeFirst = firstObserver.subscribe(() => undefined);
    const unsubscribeSecond = secondObserver.subscribe(() => undefined);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    expect(client.getQueryCache().find({ queryKey: firstKey })?.getObserversCount()).toBe(1);
    expect(client.getQueryCache().find({ queryKey: secondKey })?.getObserversCount()).toBe(1);

    await expect(refreshNativeOwnerProfileReferences(client, USER_ID)).resolves.toBe(true);

    expect(firstFetch).toHaveBeenCalledOnce();
    expect(secondFetch).not.toHaveBeenCalled();
    expect(client.getQueryData(firstKey)).toEqual([{ id: USER_ID, display_name: "Élodie 🌈" }]);
    expect(client.getQueryData(secondKey)).toEqual([{ id: OTHER_ID, display_name: "Other" }]);
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ refetchType: "none" }));
    unsubscribeFirst();
    unsubscribeSecond();
  });

  it("invalidates a counterpart on iOS/Android without invalidating an unrelated cached user", async () => {
    const client = new QueryClient();
    client.setQueryData(nativeQueryKeys.profile.current, profile);
    const targetPublic = nativeQueryKeys.profile.public(OTHER_ID);
    const unrelatedId = "33333333-3333-4333-8333-333333333333";
    const unrelatedPublic = nativeQueryKeys.profile.public(unrelatedId);
    const nearby = nativeQueryKeys.discovery.nearby(USER_ID, 42.1, 23.2);
    const search = [...nativeQueryKeys.discovery.userSearch, "peer"] as const;
    client.setQueryData(targetPublic, { profile: { id: OTHER_ID } });
    client.setQueryData(unrelatedPublic, { profile: { id: unrelatedId } });
    client.setQueryData(nativeQueryKeys.social.friends, [{
      requester_id: USER_ID,
      addressee_id: OTHER_ID,
    }]);
    client.setQueryData(nativeQueryKeys.inbox.threads, {
      threads: [{ participant_1_id: USER_ID, participant_2_id: OTHER_ID }],
    });
    client.setQueryData(nearby, [{ userId: OTHER_ID }]);
    client.setQueryData(search, [{ id: OTHER_ID }]);

    await expect(refreshNativeProfileReferences(
      client,
      USER_ID,
      OTHER_ID,
      { refetch: false },
    )).resolves.toBe(true);

    [targetPublic, nativeQueryKeys.social.friends, nativeQueryKeys.inbox.threads, nearby, search]
      .forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    expect(client.getQueryState(unrelatedPublic)?.isInvalidated).toBe(false);
    expect(client.getQueryState(nativeQueryKeys.profile.current)?.isInvalidated).toBe(false);
  });

  it("does nothing for a stale account hint or a cancelled refresh", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(nativeQueryKeys.profile.current, { ...profile, id: OTHER_ID });
    const searchKey = [...nativeQueryKeys.discovery.userSearch, "ada", "|", USER_ID] as const;
    const searchFetch = vi.fn(async () => [{ id: USER_ID, display_name: "Élodie 🌈" }]);
    client.setQueryData(searchKey, [{ id: USER_ID, display_name: "Old" }]);
    const observer = new QueryObserver(client, { queryKey: searchKey, queryFn: searchFetch, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => undefined);

    await expect(refreshNativeOwnerProfileReferences(client, USER_ID)).resolves.toBe(false);
    expect(searchFetch).not.toHaveBeenCalled();
    expect(client.getQueryState(searchKey)?.isInvalidated).toBe(false);

    client.setQueryData(nativeQueryKeys.profile.current, profile);
    const controller = new AbortController();
    controller.abort();
    await expect(refreshNativeOwnerProfileReferences(client, USER_ID, controller.signal)).resolves.toBe(false);
    expect(searchFetch).not.toHaveBeenCalled();
    expect(client.getQueryState(searchKey)?.isInvalidated).toBe(false);
    unsubscribe();
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "x-request-id": "owner-profile-native-request" },
  });
}
