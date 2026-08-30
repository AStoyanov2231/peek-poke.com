import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  clear: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: harness.apiFetch,
  jsonBody: (value: unknown) => JSON.stringify(value),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signOut: harness.signOut } },
}));
vi.mock("expo-router", () => ({ router: { replace: harness.replace } }));

import { deleteCurrentAccount } from "@/data/account-deletion";

describe("native account deletion recovery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps iOS and Android session/cache/navigation state intact on a canonical retryable failure", async () => {
    harness.apiFetch.mockRejectedValue(new Error(
      "Account deletion is temporarily unavailable. Please try again.",
    ));

    await expect(deleteCurrentAccount({ clear: harness.clear } as never)).rejects.toThrow(
      "Account deletion is temporarily unavailable",
    );
    expect(harness.signOut).not.toHaveBeenCalled();
    expect(harness.clear).not.toHaveBeenCalled();
    expect(harness.replace).not.toHaveBeenCalled();
  });

  it("clears native account state only after the durable queue succeeds", async () => {
    harness.apiFetch.mockResolvedValue({ success: true, queued: true });

    await expect(deleteCurrentAccount({ clear: harness.clear } as never)).resolves.toBeUndefined();
    expect(harness.apiFetch).toHaveBeenCalledWith("/api/account/delete", {
      method: "POST",
      body: '{"confirmation":"DELETE"}',
    });
    expect(harness.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(harness.clear).toHaveBeenCalledTimes(1);
    expect(harness.replace).toHaveBeenCalledWith("/(auth)/login");
  });
});
