import { describe, expect, it, vi } from "vitest";
import { nativeQueryKeys } from "@/data/query-keys";

vi.mock("@/data/discovery/api", () => ({
  fetchBots: vi.fn(),
  fetchNearby: vi.fn(),
  fetchPublicProfile: vi.fn(),
  fetchTagSuggestions: vi.fn(),
  resolveTags: vi.fn(),
  searchUsers: vi.fn(),
}));

describe("discovery queries", () => {
  it("uses the shared coordinate-bucketed nearby key", async () => {
    vi.stubGlobal("__DEV__", false);
    const { nearbyQueryOptions } = await import("@/data/discovery/queries");
    const options = nearbyQueryOptions(
      { lat: 42.697712, lng: 23.321945 },
      "11111111-1111-4111-8111-111111111111",
    );
    expect(options.queryKey).toEqual(nativeQueryKeys.discovery.nearby(
      "11111111-1111-4111-8111-111111111111",
      42.697712,
      23.321945,
    ));
  });

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
