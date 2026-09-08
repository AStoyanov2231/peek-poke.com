import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchContract: vi.fn() }));

vi.mock("@/lib/typed-api", () => ({ fetchContract: mocks.fetchContract }));

import { fetchAvailability } from "@/data/availability";

describe("web availability transport", () => {
  beforeEach(() => mocks.fetchContract.mockReset());

  it("opts into context-ranked discovery without changing the existing radius or limit", () => {
    fetchAvailability({ discoveryContext: true });

    expect(mocks.fetchContract).toHaveBeenCalledWith(
      "/api/availability?limit=100&radiusKm=25&discovery_context=1",
      expect.anything(),
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("keeps context-free callers compatible during rollout", () => {
    fetchAvailability();

    expect(mocks.fetchContract).toHaveBeenCalledWith(
      "/api/availability?limit=100&radiusKm=25",
      expect.anything(),
      expect.objectContaining({ signal: undefined }),
    );
  });
});
