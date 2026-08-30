import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeCursor } from "@peekpoke/shared";
import { fetchResolvedTags, fetchResolvedTagsRequest } from "@/lib/search/resolveTagIds";
import {
  fetchTagSuggestions,
  fetchTagSuggestionsRequest,
} from "@/features/search/useTagSuggestions";
import {
  fetchUserSearch,
  fetchUserSearchPageRequest,
  fetchUserSearchRequest,
} from "@/features/search/useUserSearch";

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

const malformedReads = [
  { endpoint: "tag suggestions", mutation: "extra-only", read: () => fetchTagSuggestions("music"), payload: [{ ...tag, database_only: "secret" }] },
  { endpoint: "tag suggestions", mutation: "missing-only", read: () => fetchTagSuggestions("music"), payload: [{ id: tag.id, name: tag.name, icon: tag.icon }] },
  { endpoint: "tag suggestions", mutation: "malformed/type-only", read: () => fetchTagSuggestions("music"), payload: [{ ...tag, id: 42 }] },
  { endpoint: "tag resolution", mutation: "extra-only", read: () => fetchResolvedTags(["music"]), payload: [{ ...resolvedTag, database_only: "secret" }] },
  { endpoint: "tag resolution", mutation: "missing-only", read: () => fetchResolvedTags(["music"]), payload: [{ id: resolvedTag.id, name: resolvedTag.name }] },
  { endpoint: "tag resolution", mutation: "malformed/type-only", read: () => fetchResolvedTags(["music"]), payload: [{ ...resolvedTag, icon: 42 }] },
  { endpoint: "user search", mutation: "extra-only", read: () => userSearch(), payload: [{ ...user, database_only: "secret" }] },
  { endpoint: "user search", mutation: "missing-only", read: () => userSearch(), payload: [{
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    is_online: user.is_online,
    is_nearby: user.is_nearby,
    matched_tags: user.matched_tags,
  }] },
  { endpoint: "user search", mutation: "malformed/type-only", read: () => userSearch(), payload: [{ ...user, rank: "1" }] },
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web search read transport", () => {
  it.each(malformedReads)("rejects malformed 2xx $endpoint $mutation before QueryClient caching", async ({
    endpoint,
    mutation,
    read,
    payload,
  }) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), {
      headers: { "x-request-id": "request-search-web" },
    })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ["search-contract", endpoint, mutation] as const;

    await expect(client.fetchQuery({ queryKey, queryFn: read })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
      requestId: "request-search-web",
    });
    expect(client.getQueryData(queryKey)).toBeUndefined();
  });

  it.each([
    ["tag suggestions", () => fetchTagSuggestions("music"), Array.from({ length: 21 }, () => tag)],
    ["tag resolution", () => fetchResolvedTags(["music"]), Array.from({ length: 51 }, () => resolvedTag)],
    ["user search", () => userSearch(), Array.from({ length: 52 }, () => user)],
  ])("rejects over-cardinality 2xx %s before QueryClient caching", async (endpoint, read, payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), {
      headers: { "x-request-id": "request-search-web-cardinality" },
    })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ["search-cardinality", endpoint] as const;

    await expect(client.fetchQuery({ queryKey, queryFn: read })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
    expect(client.getQueryData(queryKey)).toBeUndefined();
  });

  it("rejects two valid resolved tags for one requested name before caching", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      resolvedTag,
      resolvedTag,
    ]), { headers: { "x-request-id": "request-resolved-tags-cardinality" } })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ["resolved-tags-request-cardinality", "one-name"] as const;

    await expect(client.fetchQuery({
      queryKey,
      queryFn: () => fetchResolvedTags(["music"]),
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(client.getQueryData(queryKey)).toBeUndefined();
  });

  it("accepts the empty names and empty resolved-tags response boundary", async () => {
    const fetchMock = vi.fn(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchResolvedTags([])).resolves.toEqual([]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ names: [] });
  });

  it("accepts a canonical database case variant for a requested resolved tag", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([resolvedTag]))));

    await expect(fetchResolvedTags(["music"])).resolves.toEqual([resolvedTag]);
  });

  it.each([
    ["substituted name", ["music"], [{ ...resolvedTag, name: "Movies" }]],
    ["duplicate returned tag", ["music", "Music"], [resolvedTag, resolvedTag]],
  ])("rejects semantically invalid resolved-tag %s before caching", async (label, names, payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), {
      headers: { "x-request-id": "request-resolved-tags-membership" },
    })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ["resolved-tags-membership", label] as const;

    await expect(client.fetchQuery({
      queryKey,
      queryFn: () => fetchResolvedTags(names),
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(client.getQueryData(queryKey)).toBeUndefined();
  });

  it.each([
    ["limit 1 with 2 items", () => fetchUserSearchPageRequest(
      { q: "Ada", tag_ids: [], nearby_ids: [] },
      { limit: 1 },
    ), [user, user]],
    ["default limit 50 with 51 items", () => userSearch(), Array.from({ length: 51 }, () => user)],
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

    await expect(fetchTagSuggestions(`  ${query}  `)).resolves.toEqual([tag]);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/search/tags?q=${query}&limit=20`,
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

    await fetchResolvedTagsRequest({ names });
    await fetchUserSearchRequest({ q: "Ada", tag_ids: tagIds, nearby_ids: nearbyIds });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ names });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      q: "Ada",
      tag_ids: tagIds,
      nearby_ids: nearbyIds,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/search/users?limit=50");
  });

  it("serializes the exact user-search URL with an optional valid cursor", async () => {
    const cursor = encodeCursor({ sort_value: "1", id: USER_ID });
    const fetchMock = vi.fn(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchUserSearchPageRequest(
      { q: "Ada", tag_ids: [], nearby_ids: [] },
      { limit: 50, cursor },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/search/users?limit=50&cursor=${encodeURIComponent(cursor)}`,
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
      queryFn: () => fetchUserSearchPageRequest(
        { q: "Ada", tag_ids: [], nearby_ids: [] },
        query,
      ),
    })).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKey)).toBeUndefined();
  });

  it.each([
    ["resolve tags extra", () => fetchResolvedTagsRequest({ names: ["music"], extra: true })],
    ["resolve tags invalid", () => fetchResolvedTagsRequest({ names: [""] })],
    ["resolve tags oversized", () => fetchResolvedTagsRequest({
      names: Array.from({ length: 51 }, (_, index) => `tag-${index}`),
    })],
    ["user search extra", () => fetchUserSearchRequest({
      q: "Ada", tag_ids: [], nearby_ids: [], extra: true,
    })],
    ["user search invalid", () => fetchUserSearchRequest({
      q: "Ada", tag_ids: ["not-a-uuid"], nearby_ids: [],
    })],
    ["user search oversized", () => fetchUserSearchRequest({
      q: "Ada",
      tag_ids: [],
      nearby_ids: Array.from({ length: 501 }, () => USER_ID),
    })],
  ])("rejects %s before web serialization", (_label, request) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(request).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function userSearch() {
  return fetchUserSearch({ nameQuery: "Ada", tagIds: [], nearbyIds: [] });
}
