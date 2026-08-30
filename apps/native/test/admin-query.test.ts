import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("__DEV__", false);
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  jsonBody: JSON.stringify,
}));

describe("native admin queries", () => {
  it("gates access from bootstrap roles without Zustand state", async () => {
    const { hasAdminRole } = await import("@/data/admin/api");
    expect(hasAdminRole(["member", "admin"])).toBe(true);
    expect(hasAdminRole(["member", "moderator"])).toBe(false);
    expect(hasAdminRole(undefined)).toBe(false);
  });

  it("uses bounded cursor requests for moderation photos", async () => {
    const { ADMIN_PAGE_LIMIT, moderationPhotosPath } = await import("@/data/admin/api");
    const cursor = "v1.cursor+/=";
    const path = moderationPhotosPath("pending", cursor);

    expect(ADMIN_PAGE_LIMIT).toBe(20);
    expect(path).toBe(
      "/api/moderation/photos?status=pending&limit=20&cursor=v1.cursor%2B%2F%3D",
    );
    expect(path).not.toContain("page=");
  });

  it("uses bounded cursor requests for reports", async () => {
    const { moderationReportsPath } = await import("@/data/admin/api");
    expect(moderationReportsPath("reviewing", null))
      .toBe("/api/moderation/reports?status=reviewing&limit=20");
  });

  it("keys each server-owned queue by status and cursor", async () => {
    const { adminQueryOptions } = await import("@/data/admin/api");
    expect(adminQueryOptions.photos("rejected", "next").queryKey)
      .toEqual(["admin", "photos", "rejected", "next"]);
    expect(adminQueryOptions.reports("resolved", null).queryKey)
      .toEqual(["admin", "reports", "resolved", null]);
    expect(adminQueryOptions.coins().queryKey).toEqual(["admin", "coins"]);
  });

  it("keeps a rejection reason in the moderation mutation", async () => {
    const { apiFetch } = await import("@/lib/api");
    const { moderatePhoto } = await import("@/data/admin/api");

    await moderatePhoto("photo/one", "reject", "Not a profile photo");

    expect(apiFetch).toHaveBeenCalledWith("/api/moderation/photos/photo%2Fone", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ action: "reject", reason: "Not a profile photo" }),
      responseSchema: expect.any(Object),
    }));
  });

  it("uses the shared request-correlated report response contract", async () => {
    const { apiFetch } = await import("@/lib/api");
    const { updateReport } = await import("@/data/admin/api");
    const reportId = "00000000-0000-4000-8000-000000000006";
    const report = {
      id: reportId,
      category: "spam",
      details: null,
      status: "resolved",
      created_at: "2026-01-01T00:00:00.000Z",
      reviewed_at: "2026-01-01T00:03:00.000Z",
      reviewed_by: "00000000-0000-4000-8000-000000000001",
    };

    await updateReport(reportId, "resolved");

    expect(apiFetch).toHaveBeenCalledWith(
      `/api/moderation/reports/${reportId}`,
      expect.objectContaining({
        body: JSON.stringify({ status: "resolved" }),
        method: "PATCH",
        responseSchema: expect.any(Object),
      }),
    );
    const options = vi.mocked(apiFetch).mock.calls.at(-1)?.[1] as {
      responseSchema: { safeParse: (value: unknown) => { success: boolean } };
    };
    expect(options.responseSchema.safeParse({ report }).success).toBe(true);
    expect(options.responseSchema.safeParse({ report: { ...report, status: "dismissed" } }).success)
      .toBe(false);
    expect(options.responseSchema.safeParse({ report, internal: true }).success).toBe(false);
  });

  it("uses the strict shared report list response contract", async () => {
    const { apiFetch } = await import("@/lib/api");
    const { fetchModerationReports } = await import("@/data/admin/api");
    const payload = {
      reports: [],
      pagination: { version: "v1", next_cursor: null, has_more: false, limit: 20 },
      legacy_pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
    vi.mocked(apiFetch).mockResolvedValueOnce(payload);

    await expect(fetchModerationReports("pending", null)).resolves.toEqual({
      items: [],
      page: payload.pagination,
      total: 0,
    });
    const options = vi.mocked(apiFetch).mock.calls.at(-1)?.[1] as {
      responseSchema: { safeParse: (value: unknown) => { success: boolean } };
    };
    expect(options.responseSchema.safeParse(payload).success).toBe(true);
    expect(options.responseSchema.safeParse({ ...payload, internal: true }).success).toBe(false);
  });
});
