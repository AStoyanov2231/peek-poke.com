import { describe, expect, it, vi } from "vitest";
vi.mock("@/data/discovery/api", () => ({
  fetchPublicProfile: vi.fn(),
  fetchTagSuggestions: vi.fn(),
  resolveTags: vi.fn(),
  searchUsers: vi.fn(),
}));

describe("discovery queries", () => {
  it("keeps tag and user search keys deterministic", async () => {
    vi.stubGlobal("__DEV__", false);
    const {
      discoveryQueryKeys,
      resolvedTagsQueryOptions,
      userSearchQueryOptions,
    } = await import("@/data/discovery/queries");
    expect(resolvedTagsQueryOptions(["art", "music"]).queryKey)
      .toEqual(discoveryQueryKeys.resolvedTags(["art", "music"]));
    expect(userSearchQueryOptions("alex", ["tag-1"], ["nearby-1"]).queryKey)
      .toEqual(discoveryQueryKeys.users("alex", ["tag-1"], ["nearby-1"]));
  });
});
