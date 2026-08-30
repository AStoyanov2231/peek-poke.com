import { describe, expect, it } from "vitest";
import {
  resolvedTagsSchema,
  resolvedTagsSchemaForRequest,
  resolveTagsRequestSchema,
  encodeCursor,
  normalizeSearchQuery,
  normalizeUserSearchQuery,
  searchTagRequestSchema,
  searchTagResultsSchemaForLimit,
  searchTagResultsSchema,
  searchUserResultsSchema,
  searchUserResultsSchemaForLimit,
  searchUserRpcResultsSchema,
  userSearchQuerySchema,
  userSearchRequestSchema,
} from "@peekpoke/shared";

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

const responseContractMatrix = [
  ["tag suggestions", "extra-only", searchTagResultsSchema, [{ ...tag, database_only: "secret" }]],
  ["tag suggestions", "missing-only", searchTagResultsSchema, [{
    id: tag.id,
    name: tag.name,
    icon: tag.icon,
  }]],
  ["tag suggestions", "format-only", searchTagResultsSchema, [{ ...tag, id: "not-a-uuid" }]],
  ["tag resolution", "extra-only", resolvedTagsSchema, [{ ...resolvedTag, database_only: "secret" }]],
  ["tag resolution", "missing-only", resolvedTagsSchema, [{
    id: resolvedTag.id,
    name: resolvedTag.name,
  }]],
  ["tag resolution", "type-only", resolvedTagsSchema, [{ ...resolvedTag, icon: 42 }]],
  ["user search", "extra-only", searchUserResultsSchema, [{ ...user, database_only: "secret" }]],
  ["user search", "missing-only", searchUserResultsSchema, [{
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    is_online: user.is_online,
    is_nearby: user.is_nearby,
    matched_tags: user.matched_tags,
  }]],
  ["user search", "type-only", searchUserResultsSchema, [{ ...user, rank: "1" }]],
] as const;

describe("shared search read contracts", () => {
  it("accepts exact tag suggestion, resolved tag, and user result DTO fixtures", () => {
    expect(searchTagResultsSchema.parse([tag])).toEqual([tag]);
    expect(resolvedTagsSchema.parse([resolvedTag])).toEqual([resolvedTag]);
    expect(searchUserResultsSchema.parse([user])).toEqual([user]);
  });

  it.each(responseContractMatrix)("rejects %s %s response drift independently", (
    _endpoint,
    _mutation,
    schema,
    payload,
  ) => {
    expect(schema.safeParse(payload).success).toBe(false);
  });

  it.each([
    ["tag suggestions", searchTagResultsSchemaForLimit(1), [tag, tag]],
    ["tag resolution", resolvedTagsSchema, Array.from({ length: 51 }, () => resolvedTag)],
    ["user search", searchUserResultsSchema, Array.from({ length: 52 }, () => user)],
  ])("rejects %s over-cardinality independently", (_endpoint, schema, payload) => {
    expect(schema.safeParse(payload).success).toBe(false);
  });

  it("distinguishes the max-51 user-search RPC input from dynamic public response limits", () => {
    const rpcBoundary = Array.from({ length: 51 }, () => user);

    expect(searchUserRpcResultsSchema.safeParse(rpcBoundary).success).toBe(true);
    expect(searchUserRpcResultsSchema.safeParse([...rpcBoundary, user]).success).toBe(false);
    expect(searchUserResultsSchemaForLimit(1).safeParse([user]).success).toBe(true);
    expect(searchUserResultsSchemaForLimit(1).safeParse([user, user]).success).toBe(false);
    expect(searchUserResultsSchemaForLimit(50).safeParse(rpcBoundary).success).toBe(false);
  });

  it("binds resolved-tag response cardinality to the validated requested names", () => {
    expect(resolvedTagsSchemaForRequest(["music"]).safeParse([resolvedTag]).success).toBe(true);
    expect(resolvedTagsSchemaForRequest(["music"]).safeParse([resolvedTag, resolvedTag]).success)
      .toBe(false);
    expect(resolvedTagsSchemaForRequest([]).safeParse([]).success).toBe(true);
    expect(resolvedTagsSchemaForRequest([]).safeParse([resolvedTag]).success).toBe(false);
  });

  it("binds resolved-tag membership canonically and rejects substitutions or duplicates", () => {
    expect(resolvedTagsSchemaForRequest([" music "]).safeParse([resolvedTag]).success).toBe(true);
    expect(resolvedTagsSchemaForRequest(["music"]).safeParse([{
      ...resolvedTag,
      name: "Movies",
    }]).success).toBe(false);
    expect(resolvedTagsSchemaForRequest(["music", "Music"]).safeParse([
      resolvedTag,
      resolvedTag,
    ]).success).toBe(false);
  });

  it("shares the strict request contracts used by the backend", () => {
    const cursor = encodeCursor({ sort_value: "1", id: USER_ID });
    expect(searchTagRequestSchema.parse({ q: " music ", limit: "20" }))
      .toEqual({ q: "music", limit: 20 });
    expect(resolveTagsRequestSchema.parse({ names: [" music "] })).toEqual({ names: ["music"] });
    expect(userSearchRequestSchema.parse({})).toEqual({ q: "", tag_ids: [], nearby_ids: [] });
    expect(userSearchQuerySchema.parse({ limit: "50", cursor })).toEqual({ limit: 50, cursor });
    expect(searchTagRequestSchema.safeParse({ q: "music", limit: 51 }).success).toBe(false);
    expect(searchTagRequestSchema.safeParse({ q: "music", limit: 20, extra: true }).success).toBe(false);
    expect(searchTagRequestSchema.safeParse(normalizeSearchQuery(
      new URLSearchParams("q=music&q=movies&limit=20"),
    )).success).toBe(false);
    expect(searchTagRequestSchema.safeParse(normalizeSearchQuery(
      new URLSearchParams("q=music&limit=20&limit=10"),
    )).success).toBe(false);
    expect(resolveTagsRequestSchema.safeParse({ names: ["music"], extra: true }).success).toBe(false);
    expect(userSearchRequestSchema.safeParse({ q: "Ada", tag_ids: ["bad-id"] }).success).toBe(false);
    expect(userSearchQuerySchema.safeParse(normalizeUserSearchQuery(
      new URLSearchParams("limit=50&limit=20"),
    )).success).toBe(false);
  });
});
