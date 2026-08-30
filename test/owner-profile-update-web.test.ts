import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateOwnerProfile, webQueryKeys } from "@/data/web-query";
import {
  commitWebOwnerProfileUpdate,
  isWebProfileRecoveryQuery,
  refreshWebProfileReferences,
  refreshWebOwnerProfileReferences,
} from "@/data/owner-profile-cache";

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
  is_online: true,
  last_seen_at: timestamp,
  created_at: timestamp,
  onboarding_completed: true,
  roles: ["user" as const],
};

afterEach(() => vi.unstubAllGlobals());

describe("web owner profile update transport", () => {
  it("sends canonical input and accepts only an exact non-null response", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ display_name: "Élodie 🌈" });
      return jsonResponse({ profile });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateOwnerProfile({ display_name: "  E\u0301lodie 🌈  " })).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenCalledWith("/api/profile", expect.objectContaining({ method: "PATCH" }));
  });

  it.each([
    ["null profile", { profile: null }],
    ["extra field", { profile: { ...profile, secret: "leak" } }],
    ["noncanonical name", { profile: { ...profile, display_name: " E\u0301lodie 🌈 " } }],
  ])("rejects invalid 2xx %s before commit", async (_label, payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(payload)));
    await expect(updateOwnerProfile({ display_name: "Ada" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
  });

  it("surfaces network failure and preserves cancellation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(updateOwnerProfile({ display_name: "Ada" })).rejects.toMatchObject({
      code: "NETWORK_UNAVAILABLE",
    });

    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));
    const pending = updateOwnerProfile({ display_name: "Ada" }, controller.signal);
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("web owner profile cache commit", () => {
  it("bounds periodic recovery to profile references, not owner photos or interests", () => {
    expect(isWebProfileRecoveryQuery({ queryKey: webQueryKeys.profile } as never)).toBe(true);
    expect(isWebProfileRecoveryQuery({ queryKey: webQueryKeys.publicProfile(USER_ID) } as never)).toBe(true);
    expect(isWebProfileRecoveryQuery({ queryKey: webQueryKeys.photos } as never)).toBe(false);
    expect(isWebProfileRecoveryQuery({ queryKey: webQueryKeys.interests } as never)).toBe(false);
  });

  it("commits a validated response and invalidates only caches containing the owner", async () => {
    const client = new QueryClient();
    client.setQueryData(webQueryKeys.profile, { ...profile, display_name: "Old" });
    client.setQueryData(webQueryKeys.publicProfile(USER_ID), {
      profile: { id: USER_ID, display_name: "Old", bio: "Old" },
    });
    const matchingKeys = [
      webQueryKeys.threads,
      ["web", "search", "users", "ada"] as const,
    ];
    client.setQueryData(webQueryKeys.friends, {
      friends: [{ id: OTHER_ID }], requests: [], sentRequests: [],
    });
    client.setQueryData(webQueryKeys.threads, {
      threads: [{ participant_1: { id: USER_ID }, participant_2: { id: OTHER_ID } }],
    });
    client.setQueryData(matchingKeys[1], [{ userId: USER_ID }]);
    client.setQueryData(matchingKeys[1], [{ id: USER_ID }]);

    expect(commitWebOwnerProfileUpdate(client, USER_ID, profile)).toBe(true);
    expect(client.getQueryData(webQueryKeys.profile)).toEqual(profile);
    expect(client.getQueryData<{ profile: { display_name: string } }>(webQueryKeys.publicProfile(USER_ID))?.profile.display_name).toBe("Élodie 🌈");
    await refreshWebOwnerProfileReferences(client, USER_ID);
    expect(client.getQueryState(webQueryKeys.publicProfile(USER_ID))?.isInvalidated).toBe(true);
    matchingKeys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    expect(client.getQueryState(webQueryKeys.friends)?.isInvalidated).toBe(false);
  });

  it("targets a counterpart across public, social, inbox, and search without touching a nonrecipient", async () => {
    const client = new QueryClient();
    client.setQueryData(webQueryKeys.profile, { ...profile, id: OTHER_ID });
    const matching = {
      public: webQueryKeys.publicProfile(USER_ID),
      friends: webQueryKeys.friends,
      threads: webQueryKeys.threads,
      search: ["web", "search", "users", "ada"] as const,
    };
    const unrelatedPublic = webQueryKeys.publicProfile("33333333-3333-4333-8333-333333333333");
    client.setQueryData(matching.public, { profile: { id: USER_ID } });
    client.setQueryData(matching.friends, {
      friends: [{ id: USER_ID }], requests: [], sentRequests: [],
    });
    client.setQueryData(matching.threads, {
      threads: [{ participant_1: { id: OTHER_ID }, participant_2: { id: USER_ID } }],
    });
    client.setQueryData(matching.search, [{ id: USER_ID }]);
    client.setQueryData(unrelatedPublic, { profile: { id: unrelatedPublic[2] } });

    await refreshWebProfileReferences(client, OTHER_ID, USER_ID, { refetch: false });

    Object.values(matching).forEach((key) => {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    });
    expect(client.getQueryState(unrelatedPublic)?.isInvalidated).toBe(false);
    expect(client.getQueryState(webQueryKeys.profile)?.isInvalidated).toBe(false);
  });

  it("fences an account switch and a mismatched response", () => {
    const client = new QueryClient();
    client.setQueryData(webQueryKeys.profile, { ...profile, id: OTHER_ID });

    expect(commitWebOwnerProfileUpdate(client, USER_ID, profile)).toBe(false);
    expect(client.getQueryData<{ id: string }>(webQueryKeys.profile)?.id).toBe(OTHER_ID);
    client.setQueryData(webQueryKeys.profile, profile);
    expect(commitWebOwnerProfileUpdate(client, USER_ID, { ...profile, id: OTHER_ID })).toBe(false);
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "x-request-id": "owner-profile-web-request" },
  });
}
