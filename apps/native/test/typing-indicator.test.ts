/* eslint-disable import/first -- transport dependency must be mocked before subject import. */
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiFetch: mocks.apiFetch }));
vi.mock("@/lib/supabase", () => ({ supabase: { channel: vi.fn() } }));

import { sendTypingSignal } from "@/hooks/use-typing-indicator";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";

describe("native typing indicator", () => {
  it("consumes a best-effort signal failure instead of leaving an unhandled promise", async () => {
    const failure = new Error("typing unavailable");
    mocks.apiFetch.mockRejectedValueOnce(failure);

    await expect(sendTypingSignal(THREAD_ID)).resolves.toBeUndefined();
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      `/api/dm/${THREAD_ID}/typing`,
      { method: "POST" },
    );
  });
});
