import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({
  apiFetch: mocks.apiFetch,
  jsonBody: vi.fn(),
}));

// eslint-disable-next-line import/first
import { fetchAvailability } from "@/data/availability";

describe("native availability transport", () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
    mocks.apiFetch.mockResolvedValue({ availability: null, people: [] });
  });

  it("requests the selected discovery radius from the server", async () => {
    await fetchAvailability({ radiusKm: 2 });

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      "/api/availability?radiusKm=2",
      expect.objectContaining({ responseSchema: expect.anything() }),
    );
  });

  it("keeps the existing 25 km request as the default", async () => {
    await fetchAvailability();

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      "/api/availability?radiusKm=25",
      expect.objectContaining({ responseSchema: expect.anything() }),
    );
  });
});
