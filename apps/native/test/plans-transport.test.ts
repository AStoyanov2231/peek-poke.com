import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({
  apiFetch: mocks.apiFetch,
  jsonBody: vi.fn(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "native-plan-key-000001" }));

// eslint-disable-next-line import/first
import { fetchPlans } from "@/data/plans";

describe("native Plans transport", () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
    mocks.apiFetch.mockResolvedValue({ plans: [] });
  });

  it("uses the viewer-scoped Plans endpoint, which applies nearby discovery on the server", async () => {
    await fetchPlans();

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      "/api/plans",
      expect.objectContaining({ responseSchema: expect.anything() }),
    );
  });
});
