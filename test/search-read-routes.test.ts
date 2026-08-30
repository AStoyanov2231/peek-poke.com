import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeCursor } from "@peekpoke/shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TAG_ID = "22222222-2222-4222-8222-222222222222";
const RESULT_USER_ID = "33333333-3333-4333-8333-333333333333";

const routeMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  enforceRateLimit: vi.fn(async () => null as Response | null),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: USER_ID }, supabase: {} }),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: routeMocks.enforceRateLimit,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: routeMocks.rpc }),
}));

import { GET as getTags } from "@/app/api/search/tags/route";
import { POST as resolveTags } from "@/app/api/search/tags/resolve/route";
import { POST as searchUsers } from "@/app/api/search/users/route";

const tag = { id: TAG_ID, name: "Music", icon: "music", category: "Arts" };
const resolvedTag = { id: TAG_ID, name: "Music", icon: "music" };
const user = {
  id: RESULT_USER_ID,
  username: "ada",
  display_name: "Ada",
  avatar_url: null,
  is_online: true,
  is_nearby: false,
  matched_tags: [resolvedTag],
  rank: 1,
};

const malformedRouteCases = [
  ["tag suggestions", "extra-only", () => tagRequest(), [{ ...tag, database_only: "secret" }]],
  ["tag suggestions", "missing-only", () => tagRequest(), [{ id: tag.id, name: tag.name, icon: tag.icon }]],
  ["tag suggestions", "malformed/type-only", () => tagRequest(), [{ ...tag, id: 42 }]],
  ["tag resolution", "extra-only", () => resolveRequest(), [{ ...resolvedTag, database_only: "secret" }]],
  ["tag resolution", "missing-only", () => resolveRequest(), [{ id: resolvedTag.id, name: resolvedTag.name }]],
  ["tag resolution", "malformed/type-only", () => resolveRequest(), [{ ...resolvedTag, icon: 42 }]],
  ["user search", "extra-only", () => userRequest(), [{ ...user, database_only: "secret" }]],
  ["user search", "missing-only", () => userRequest(), [{
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    is_online: user.is_online,
    is_nearby: user.is_nearby,
    matched_tags: user.matched_tags,
  }]],
  ["user search", "malformed/type-only", () => userRequest(), [{ ...user, rank: "1" }]],
] as const;

describe("search read route response contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.enforceRateLimit.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns strict canonical payloads and preserves user-search pagination headers", async () => {
    routeMocks.rpc
      .mockResolvedValueOnce({ data: [tag], error: null })
      .mockResolvedValueOnce({ data: [resolvedTag], error: null })
      .mockResolvedValueOnce({ data: [user, { ...user, id: "44444444-4444-4444-8444-444444444444", rank: 2 }], error: null });

    const tagsResponse = await tagRequest(1);
    const resolvedResponse = await resolveTags(jsonRequest("/api/search/tags/resolve", { names: ["music"] }), {} as never);
    const usersResponse = await searchUsers(jsonRequest("/api/search/users?limit=1", {
      q: "Ada",
      tag_ids: [],
      nearby_ids: [],
    }), {} as never);

    await expect(tagsResponse.json()).resolves.toEqual([tag]);
    await expect(resolvedResponse.json()).resolves.toEqual([resolvedTag]);
    await expect(usersResponse.json()).resolves.toEqual([user]);
    expect(usersResponse.headers.get("x-api-version")).toBe("v1");
    expect(usersResponse.headers.get("x-has-more")).toBe("true");
    expect(usersResponse.headers.get("x-next-cursor")).toBeTruthy();
    expect(routeMocks.rpc).toHaveBeenNthCalledWith(1, "search_interest_tags", {
      q: "mus",
    });
  });

  it("passes shared-valid resolve and user-search boundaries through without narrowing", async () => {
    const names = Array.from({ length: 50 }, (_, index) => `tag-${index}`);
    const tagIds = Array.from({ length: 20 }, () => TAG_ID);
    const nearbyIds = Array.from({ length: 500 }, () => RESULT_USER_ID);
    routeMocks.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const resolvedResponse = await resolveTags(jsonRequest("/api/search/tags/resolve", { names }), {} as never);
    const usersResponse = await searchUsers(jsonRequest("/api/search/users", {
      q: "Ada",
      tag_ids: tagIds,
      nearby_ids: nearbyIds,
    }), {} as never);

    expect(resolvedResponse.status).toBe(200);
    expect(usersResponse.status).toBe(200);
    expect(routeMocks.rpc).toHaveBeenNthCalledWith(1, "resolve_interest_tags", { names });
    expect(routeMocks.rpc).toHaveBeenNthCalledWith(2, "search_users_for_user", {
      p_user_id: USER_ID,
      q: "Ada",
      tag_ids: tagIds,
      nearby_ids: nearbyIds,
      result_limit: 51,
    });
  });

  it.each(malformedRouteCases)("fails %s closed for an otherwise-valid %s DTO mutation", async (
    _endpoint,
    _mutation,
    requestRoute,
    payload,
  ) => {
    routeMocks.rpc.mockResolvedValueOnce({ data: payload, error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await requestRoute();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "SEARCH_FAILED" });
  });

  it.each([
    ["tag suggestions", () => tagRequest(1), [tag, tag]],
    ["tag resolution", () => resolveRequest(), Array.from({ length: 51 }, () => resolvedTag)],
    ["user search", () => userRequest(), Array.from({ length: 52 }, () => user)],
  ])("fails %s closed on an otherwise-valid over-cardinality response", async (
    _endpoint,
    requestRoute,
    payload,
  ) => {
    routeMocks.rpc.mockResolvedValueOnce({ data: payload, error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await requestRoute();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "SEARCH_FAILED" });
  });

  it("fails one-name tag resolution closed when the RPC returns two valid results", async () => {
    routeMocks.rpc.mockResolvedValueOnce({ data: [resolvedTag, resolvedTag], error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await resolveRequest();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "SEARCH_FAILED" });
  });

  it("accepts the empty names and empty resolved-tags response boundary", async () => {
    routeMocks.rpc.mockResolvedValueOnce({ data: [], error: null });

    const response = await resolveTags(jsonRequest("/api/search/tags/resolve", { names: [] }), {} as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
    expect(routeMocks.rpc).toHaveBeenCalledWith("resolve_interest_tags", { names: [] });
  });

  it("accepts a canonical database case variant for a requested resolved tag", async () => {
    routeMocks.rpc.mockResolvedValueOnce({ data: [resolvedTag], error: null });

    const response = await resolveRequest();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([resolvedTag]);
  });

  it.each([
    ["substituted name", ["music"], [{ ...resolvedTag, name: "Movies" }]],
    ["duplicate returned tag", ["music", "Music"], [resolvedTag, resolvedTag]],
  ])("fails tag resolution closed for a semantically invalid %s", async (_label, names, data) => {
    routeMocks.rpc.mockResolvedValueOnce({ data, error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await resolveTags(jsonRequest("/api/search/tags/resolve", { names }), {} as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "SEARCH_FAILED" });
  });

  it.each([
    ["out-of-range limit", "https://example.test/api/search/tags?q=mus&limit=51"],
    ["unknown parameter", "https://example.test/api/search/tags?q=mus&limit=20&extra=true"],
    ["duplicate q", "https://example.test/api/search/tags?q=mus&q=music&limit=20"],
    ["duplicate limit", "https://example.test/api/search/tags?q=mus&limit=20&limit=10"],
    ["duplicate unknown", "https://example.test/api/search/tags?q=mus&limit=20&extra=1&extra=2"],
  ])("rejects an exact tag request with %s", async (_label, url) => {
    const response = await getTags(new Request(url), {} as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_PARAMS" });
    expect(routeMocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid limit", "limit=0", "INVALID_PAGINATION"],
    ["oversized limit", "limit=51", "INVALID_PAGINATION"],
    ["invalid cursor", "limit=50&cursor=not-a-cursor", "INVALID_CURSOR"],
    ["unknown parameter", "limit=50&extra=true", "INVALID_PAGINATION"],
    ["duplicate parameter", "limit=50&limit=20", "INVALID_PAGINATION"],
  ])("rejects user-search query with %s before RPC", async (_label, query, code) => {
    const response = await searchUsers(jsonRequest(`/api/search/users?${query}`, {
      q: "Ada",
      tag_ids: [],
      nearby_ids: [],
    }), {} as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code });
    expect(routeMocks.rpc).not.toHaveBeenCalled();
  });

  it("accepts a valid user-search cursor query before invoking the established RPC", async () => {
    const cursor = encodeCursor({ sort_value: "1", id: RESULT_USER_ID });
    routeMocks.rpc.mockResolvedValueOnce({ data: [user], error: null });

    const response = await searchUsers(jsonRequest(`/api/search/users?limit=50&cursor=${encodeURIComponent(cursor)}`, {
      q: "Ada",
      tag_ids: [],
      nearby_ids: [],
    }), {} as never);

    expect(response.status).toBe(200);
    expect(routeMocks.rpc).toHaveBeenCalledWith("search_users_for_user", {
      p_user_id: USER_ID,
      q: "Ada",
      tag_ids: [],
      nearby_ids: [],
      result_limit: 51,
    });
  });

  it("uses a max-51 RPC input to return a max-50 default public page", async () => {
    routeMocks.rpc.mockResolvedValueOnce({
      data: Array.from({ length: 51 }, (_, index) => ({
        ...user,
        id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000001`,
        rank: index + 1,
      })),
      error: null,
    });

    const response = await userRequest();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toHaveLength(50);
    expect(response.headers.get("x-has-more")).toBe("true");
    expect(response.headers.get("x-next-cursor")).toBeTruthy();
  });

  it.each([
    ["resolve tags extra", "/api/search/tags/resolve", { names: ["music"], extra: true }],
    ["resolve tags invalid", "/api/search/tags/resolve", { names: [""] }],
    ["resolve tags oversized", "/api/search/tags/resolve", {
      names: Array.from({ length: 51 }, (_, index) => `tag-${index}`),
    }],
    ["user search extra", "/api/search/users", {
      q: "Ada", tag_ids: [], nearby_ids: [], extra: true,
    }],
    ["user search invalid", "/api/search/users", {
      q: "Ada", tag_ids: ["not-a-uuid"], nearby_ids: [],
    }],
    ["user search oversized", "/api/search/users", {
      q: "Ada",
      tag_ids: [],
      nearby_ids: Array.from({ length: 501 }, () => RESULT_USER_ID),
    }],
  ])("rejects %s through the shared request contract", async (_label, path, body) => {
    const response = path.endsWith("resolve")
      ? await resolveTags(jsonRequest(path, body), {} as never)
      : await searchUsers(jsonRequest(path, body), {} as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(routeMocks.rpc).not.toHaveBeenCalled();
  });
});

function tagRequest(limit = 20) {
  return getTags(new Request(`https://example.test/api/search/tags?q=mus&limit=${limit}`), {} as never);
}

function resolveRequest() {
  return resolveTags(jsonRequest("/api/search/tags/resolve", { names: ["music"] }), {} as never);
}

function userRequest() {
  return searchUsers(jsonRequest("/api/search/users", { q: "Ada", tag_ids: [], nearby_ids: [] }), {} as never);
}

function jsonRequest(path: string, body: unknown) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
