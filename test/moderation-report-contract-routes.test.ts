import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  moderationReportMutationResponseSchema,
  moderationReportsResponseSchema,
} from "@peekpoke/shared";

const MODERATOR_ID = "10000000-0000-4000-8000-000000000001";
const REPORT_ID = "20000000-0000-4000-8000-000000000001";
const TIMESTAMP = "2026-08-07T10:00:00.000Z";

const database = vi.hoisted(() => ({
  mode: "list" as "list" | "mutation",
  rows: [] as Array<Record<string, unknown>>,
  mutationRow: null as Record<string, unknown> | null,
  from: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireModeratorRole: vi.fn(async () => null),
  withAuth: (handler: (request: NextRequest, context: unknown) => Promise<Response>) =>
    (request: NextRequest) => handler(request, {
      params: { reportId: REPORT_ID },
      supabase: {},
      user: { id: MODERATOR_ID },
    }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: database.from }),
}));

import { GET } from "@/app/api/moderation/reports/route";
import { PATCH } from "@/app/api/moderation/reports/[reportId]/route";

const rawReport = {
  id: REPORT_ID,
  category: "spam",
  details: null,
  status: "pending",
  created_at: TIMESTAMP,
  reviewed_at: null,
  reviewed_by: null,
  reporter: null,
  reported_user: null,
  reviewer: null,
};
const rawProfile = {
  id: MODERATOR_ID,
  username: "moderator",
  display_name: "Moderator",
  avatar_url: null,
  location_text: null,
  is_online: false,
  last_seen_at: null,
};

describe("moderation report route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.mode = "list";
    database.rows = [rawReport];
    database.mutationRow = {
      ...rawReport,
      status: "resolved",
      reviewed_at: TIMESTAMP,
      reviewed_by: MODERATOR_ID,
    };
    database.from.mockImplementation(() => (
      database.mode === "list" ? listQuery() : mutationQuery()
    ));
  });

  it("returns a final strictly validated list DTO while preserving valid nulls", async () => {
    const response = await GET(new NextRequest(
      "https://example.test/api/moderation/reports?status=pending&limit=20",
    ), {} as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(moderationReportsResponseSchema.parse(payload)).toEqual(payload);
    expect(payload.reports[0]).toMatchObject({
      details: null,
      reviewed_at: null,
      reviewed_by: null,
    });
    expect(payload.reports[0]).not.toHaveProperty("reporter");
  });

  it.each([
    ["status", { ...rawReport, status: "unknown" }],
    ["id", { ...rawReport, id: "not-a-uuid" }],
    ["timestamp", { ...rawReport, created_at: "not-a-date" }],
    ["null required field", { ...rawReport, category: null }],
    ["numeric details", { ...rawReport, details: 42 }],
    ["object details", { ...rawReport, details: { text: "secret" } }],
    ["numeric reviewed_by", { ...rawReport, reviewed_by: 42 }],
    ["invalid reviewed_by UUID", { ...rawReport, reviewed_by: "invalid" }],
    ["numeric reviewed_at", { ...rawReport, reviewed_at: 42 }],
    ["invalid reviewed_at timestamp", { ...rawReport, reviewed_at: "yesterday" }],
    ["numeric reporter relation", { ...rawReport, reporter: 42 }],
    ["empty reporter object", { ...rawReport, reporter: {} }],
    ["masked nested display name", {
      ...rawReport,
      reporter: { ...rawProfile, display_name: 42 },
    }],
    ["nested invalid timestamp", {
      ...rawReport,
      reported_user: { ...rawProfile, last_seen_at: "yesterday" },
    }],
    ["nested invalid UUID", {
      ...rawReport,
      reported_user: { ...rawProfile, id: "invalid" },
    }],
    ["malformed reviewer relation", {
      ...rawReport,
      reviewer: { ...rawProfile, username: 42 },
    }],
    ["top-level extra", { ...rawReport, database_only: "secret" }],
    ["nested extra", {
      ...rawReport,
      reporter: { ...rawProfile, auth_user_id: "secret" },
    }],
  ])("fails a malformed final list %s closed", async (_label, malformed) => {
    database.rows = [malformed];
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new NextRequest(
      "https://example.test/api/moderation/reports?status=pending&limit=20",
    ), {} as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "MODERATION_FETCH_FAILED" });
  });

  it("returns only a request-correlated strict mutation DTO", async () => {
    database.mode = "mutation";
    const response = await PATCH(patchRequest(), {} as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(moderationReportMutationResponseSchema.parse(payload)).toEqual(payload);
    expect(payload.report).toMatchObject({ id: REPORT_ID, status: "resolved" });
  });

  it.each([
    ["wrong status", { ...rawReport, status: "dismissed", reviewed_by: MODERATOR_ID }],
    ["wrong id", { ...rawReport, id: MODERATOR_ID, status: "resolved", reviewed_by: MODERATOR_ID }],
    ["malformed reviewer", { ...rawReport, status: "resolved", reviewed_by: "invalid" }],
    ["numeric details", {
      ...rawReport,
      status: "resolved",
      reviewed_by: MODERATOR_ID,
      details: 42,
    }],
    ["object reviewed_at", {
      ...rawReport,
      status: "resolved",
      reviewed_by: MODERATOR_ID,
      reviewed_at: { at: TIMESTAMP },
    }],
    ["invalid reviewed_at timestamp", {
      ...rawReport,
      status: "resolved",
      reviewed_by: MODERATOR_ID,
      reviewed_at: "not-a-date",
    }],
    ["malformed reported user", {
      ...rawReport,
      status: "resolved",
      reviewed_by: MODERATOR_ID,
      reported_user: { ...rawProfile, is_online: "yes" },
    }],
    ["extra raw field", {
      ...rawReport,
      status: "resolved",
      reviewed_by: MODERATOR_ID,
      internal: true,
    }],
  ])("fails a malformed final mutation %s closed", async (_label, malformed) => {
    database.mode = "mutation";
    database.mutationRow = malformed;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(patchRequest(), {} as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "MODERATION_REVIEW_FAILED" });
  });

  it("rejects extra mutation request fields before database update", async () => {
    database.mode = "mutation";
    const response = await PATCH(patchRequest({ internal: true }), {} as never);

    expect(response.status).toBe(400);
  });
});

function listQuery() {
  const query = {
    eq: vi.fn(),
    limit: vi.fn(async () => ({ count: database.rows.length, data: database.rows, error: null })),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn(async () => ({ count: database.rows.length, data: database.rows, error: null })),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.or.mockReturnValue(query);
  return query;
}

function mutationQuery() {
  const query = {
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(async () => ({ data: database.mutationRow, error: null })),
    update: vi.fn(),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function patchRequest(extra: Record<string, unknown> = {}) {
  return new NextRequest(`https://example.test/api/moderation/reports/${REPORT_ID}`, {
    body: JSON.stringify({ status: "resolved", ...extra }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}
