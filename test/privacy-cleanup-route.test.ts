import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc }),
}));

import { GET } from "@/app/api/internal/privacy-cleanup/route";

const originalCronSecret = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "privacy-cleanup-secret";
  rpc.mockReset();
});

afterEach(() => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});

describe("privacy cleanup worker", () => {
  it("requires the scheduler secret before calling the server-only purge", async () => {
    const response = await GET(new Request("https://example.test/api/internal/privacy-cleanup"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns only the bounded deletion count", async () => {
    rpc.mockResolvedValueOnce({ data: 7, error: null });
    const response = await GET(new Request("https://example.test/api/internal/privacy-cleanup", {
      headers: { authorization: "Bearer privacy-cleanup-secret" },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ deleted: 7 });
    expect(rpc).toHaveBeenCalledWith("purge_stale_user_locations", { p_batch_size: 1000 });
  });

  it("does not leak database errors or accept an unbounded result", async () => {
    rpc.mockResolvedValueOnce({ data: 1001, error: null });
    const response = await GET(new Request("https://example.test/api/internal/privacy-cleanup", {
      headers: { authorization: "Bearer privacy-cleanup-secret" },
    }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Cleanup failed" });
  });
});
