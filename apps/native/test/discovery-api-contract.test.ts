import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeCursor } from "@peekpoke/shared";
import {
  resolvedTagsQueryOptions,
  tagSuggestionsQueryOptions,
  userSearchQueryOptions,
} from "@/data/discovery/queries";
import {
  fetchTagSuggestions,
  fetchTagSuggestionsRequest,
  resolveTagsRequest,
  searchUsersPageRequest,
  searchUsersRequest,
} from "@/data/discovery/api";

const TAG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const tag = { id: TAG_ID, name: "Music", icon: "music", category: "Arts" };
const resolvedTag = { id: TAG_ID, name: "Music", icon: "music" };
const user = {
  id: USER_ID,
  username: "ada",
  display_name: "Ada",
  avatar_url: null,
  is_online: true,
  is_nearby: false,
  matched_tags: [resolvedTag],
  rank: 1,
};

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

vi.mock("@/lib/env", () => ({
  env: { apiBaseUrl: "https://www.peek-poke.com" },
}));

const malformedQueries = [
  { endpoint: "tag suggestions", mutation: "extra-only", options: () => tagSuggestionsQueryOptions("music"), payload: [{ ...tag, database_only: "secret" }] },
  { endpoint: "tag suggestions", mutation: "missing-only", options: () => tagSuggestionsQueryOptions("music"), payload: [{ id: tag.id, name: tag.name, icon: tag.icon }] },
  { endpoint: "tag suggestions", mutation: "malformed/type-only", options: () => tagSuggestionsQueryOptions("music"), payload: [{ ...tag, id: 42 }] },
  { endpoint: "tag resolution", mutation: "extra-only", options: () => resolvedTagsQueryOptions(["music"]), payload: [{ ...resolvedTag, database_only: "secret" }] },
  { endpoint: "tag resolution", mutation: "missing-only", options: () => resolvedTagsQueryOptions(["music"]), payload: [{ id: resolvedTag.id, name: resolvedTag.name }] },
  { endpoint: "tag resolution", mutation: "malformed/type-only", options: () => resolvedTagsQueryOptions(["music"]), payload: [{ ...resolvedTag, icon: 42 }] },
  { endpoint: "user search", mutation: "extra-only", options: () => userSearchQueryOptions("Ada", [], []), payload: [{ ...user, database_only: "secret" }] },
  { endpoint: "user search", mutation: "missing-only", options: () => userSearchQueryOptions("Ada", [], []), payload: [{
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    is_online: user.is_online,
    is_nearby: user.is_nearby,
    matched_tags: user.matched_tags,
  }] },
  { endpoint: "user search", mutation: "malformed/type-only", options: () => userSearchQueryOptions("Ada", [], []), payload: [{ ...user, rank: "1" }] },
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("native discovery search contracts", () => {
  it.each(malformedQueries)("rejects malformed 2xx $endpoint $mutation before QueryClient caching", async ({
    endpoint,
    mutation,
    options,
    payload,
  }) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), {
      headers: { "x-request-id": "request-search-native" },
    })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const query = options();
    const cacheKey = ["search-contract", endpoint, mutation] as const;

    await expect(client.fetchQuery({ ...query, queryKey: cacheKey, retry: false })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
      requestId: "request-search-native",
    });
    expect(client.getQueryData(cacheKey)).toBeUndefined();
  });

  it.each([
    ["tag suggestions", () => tagSuggestionsQueryOptions("music"), Array.from({ length: 21 }, () => tag)],
    ["tag resolution", () => resolvedTagsQueryOptions(["music"]), Array.from({ length: 51 }, () => resolvedTag)],
    ["user search", () => userSearchQueryOptions("Ada", [], []), Array.from({ length: 52 }, () => user)],
  ])("rejects over-cardinality 2xx %s before QueryClient caching", async (endpoint, options, payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), {
      headers: { "x-request-id": "request-search-native-cardinality" },
    })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const query = options();
    const cacheKey = ["search-cardinality", endpoint] as const;

    await expect(client.fetchQuery({ ...query, queryKey: cacheKey, retry: false })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
    expect(client.getQueryData(cacheKey)).toBeUndefined();
  });

  it("rejects two valid resolved tags for one requested name before caching", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      resolvedTag,
      resolvedTag,
    ]), { headers: { "x-request-id": "request-resolved-tags-cardinality" } })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const query = resolvedTagsQueryOptions(["music"]);
    const cacheKey = ["resolved-tags-request-cardinality", "one-name"] as const;

    await expect(client.fetchQuery({ ...query, queryKey: cacheKey, retry: false }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(client.getQueryData(cacheKey)).toBeUndefined();
  });

  it("accepts the empty names and empty resolved-tags response boundary", async () => {
    const fetchMock = vi.fn(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveTagsRequest({ names: [] })).resolves.toEqual([]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ names: [] });
  });

  it("accepts a canonical database case variant for a requested resolved tag", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([resolvedTag]))));

    await expect(resolveTagsRequest({ names: ["music"] })).resolves.toEqual([resolvedTag]);
  });

  it.each([
    ["substituted name", ["music"], [{ ...resolvedTag, name: "Movies" }]],
    ["duplicate returned tag", ["music", "Music"], [resolvedTag, resolvedTag]],
  ])("rejects semantically invalid resolved-tag %s before caching", async (label, names, payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), {
      headers: { "x-request-id": "request-resolved-tags-membership" },
    })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const cacheKey = ["resolved-tags-membership", label] as const;

    await expect(client.fetchQuery({
      queryKey: cacheKey,
      queryFn: () => resolveTagsRequest({ names }),
      retry: false,
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(client.getQueryData(cacheKey)).toBeUndefined();
  });

  it.each([
    ["limit 1 with 2 items", () => searchUsersPageRequest(
      { q: "Ada", tag_ids: [], nearby_ids: [] },
      { limit: 1 },
    ), [user, user]],
    ["default limit 50 with 51 items", () => searchUsersRequest({
      q: "Ada", tag_ids: [], nearby_ids: [],
    }), Array.from({ length: 51 }, () => user)],
  ])("rejects malformed user-search public cardinality: %s", async (label, read, payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), {
      headers: { "x-request-id": "request-user-search-public-cardinality" },
    })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ["user-search-public-cardinality", label] as const;

    await expect(client.fetchQuery({ queryKey, queryFn: read })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
    expect(client.getQueryData(queryKey)).toBeUndefined();
  });

  it("canonicalizes a whitespace-padded boundary-valid tag query with the shared limit", async () => {
    const query = "x".repeat(100);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([tag])));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(client.fetchQuery(tagSuggestionsQueryOptions(`  ${query}  `))).resolves.toEqual([tag]);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://www.peek-poke.com/api/search/tags?q=${query}&limit=20`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it.each([
    ["oversized q", () => fetchTagSuggestions("x".repeat(101))],
    ["limit below minimum", () => fetchTagSuggestionsRequest({ q: "music", limit: 0 })],
    ["limit above maximum", () => fetchTagSuggestionsRequest({ q: "music", limit: 51 })],
  ])("rejects tag suggestions with %s before fetch or cache commit", async (label, read) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ["tag-request-contract", label] as const;

    await expect(client.fetchQuery({ queryKey, queryFn: read })).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKey)).toBeUndefined();
  });

  it("serializes the full shared-valid resolve and user-search boundaries", async () => {
    const names = Array.from({ length: 50 }, (_, index) => `tag-${index}`);
    const tagIds = Array.from({ length: 20 }, () => TAG_ID);
    const nearbyIds = Array.from({ length: 500 }, () => USER_ID);
    const fetchMock = vi.fn(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);

    await resolveTagsRequest({ names });
    await searchUsersRequest({ q: "Ada", tag_ids: tagIds, nearby_ids: nearbyIds });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ names });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      q: "Ada",
      tag_ids: tagIds,
      nearby_ids: nearbyIds,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://www.peek-poke.com/api/search/users?limit=50",
    );
  });

  it("serializes the exact user-search URL with an optional valid cursor", async () => {
    const cursor = encodeCursor({ sort_value: "1", id: USER_ID });
    const fetchMock = vi.fn(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);

    await searchUsersPageRequest(
      { q: "Ada", tag_ids: [], nearby_ids: [] },
      { limit: 50, cursor },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://www.peek-poke.com/api/search/users?limit=50&cursor=${encodeURIComponent(cursor)}`,
    );
  });

  it.each([
    ["invalid limit", { limit: 0 }],
    ["invalid cursor", { limit: 50, cursor: "not-a-cursor" }],
    ["unknown parameter", { limit: 50, extra: true }],
    ["duplicate parameter", new URLSearchParams("limit=50&limit=20")],
  ])("rejects user-search query with %s before fetch or cache commit", async (label, query) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ["user-search-query-contract", label] as const;

    await expect(client.fetchQuery({
      queryKey,
      queryFn: () => searchUsersPageRequest(
        { q: "Ada", tag_ids: [], nearby_ids: [] },
        query,
      ),
    })).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKey)).toBeUndefined();
  });

  it.each([
    ["resolve tags extra", () => resolveTagsRequest({ names: ["music"], extra: true })],
    ["resolve tags invalid", () => resolveTagsRequest({ names: [""] })],
    ["resolve tags oversized", () => resolveTagsRequest({
      names: Array.from({ length: 51 }, (_, index) => `tag-${index}`),
    })],
    ["user search extra", () => searchUsersRequest({
      q: "Ada", tag_ids: [], nearby_ids: [], extra: true,
    })],
    ["user search invalid", () => searchUsersRequest({
      q: "Ada", tag_ids: ["not-a-uuid"], nearby_ids: [],
    })],
    ["user search oversized", () => searchUsersRequest({
      q: "Ada",
      tag_ids: [],
      nearby_ids: Array.from({ length: 501 }, () => USER_ID),
    })],
  ])("rejects %s before native serialization", (_label, request) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(request).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
