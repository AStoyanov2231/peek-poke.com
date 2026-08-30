import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiTransportError,
  API_VERSION,
  contractFixtureReport,
} from "@peekpoke/shared";
import {
  fetchAdminReports,
  moderationReportMutationErrorMessage,
  updateAdminReport,
} from "@/data/admin-query";

const REPORT_ID = contractFixtureReport.id;
const reviewedReport = {
  ...contractFixtureReport,
  status: "resolved" as const,
  reviewed_at: "2026-01-01T00:03:00.000Z",
  reviewed_by: "00000000-0000-4000-8000-000000000001",
};
const listResponse = {
  reports: [contractFixtureReport],
  pagination: { version: API_VERSION, next_cursor: null, has_more: false, limit: 100 },
  legacy_pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
};

afterEach(() => vi.unstubAllGlobals());

describe("web moderation report transport", () => {
  it("parses strict list and correlated mutation responses before returning them", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(listResponse))
      .mockResolvedValueOnce(jsonResponse({ report: reviewedReport }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAdminReports("pending")).resolves.toEqual(listResponse);
    await expect(updateAdminReport(REPORT_ID, "resolved"))
      .resolves.toEqual({ report: reviewedReport });
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/moderation/reports/${REPORT_ID}`,
      expect.objectContaining({
        body: JSON.stringify({ status: "resolved" }),
        method: "PATCH",
      }),
    );
  });

  it.each([
    ["extra list field", { ...listResponse, database_only: "secret" }],
    ["extra report field", {
      ...listResponse,
      reports: [{ ...contractFixtureReport, reporter_auth_id: "secret" }],
    }],
    ["malformed report", {
      ...listResponse,
      reports: [{ ...contractFixtureReport, id: "not-a-uuid" }],
    }],
  ])("rejects %s before committing the report queue", async (_label, payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(payload)));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ["admin-reports", "owner", "pending"];

    await expect(client.fetchQuery({
      queryKey: key,
      queryFn: () => fetchAdminReports("pending"),
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it.each([
    ["extra", { report: reviewedReport, internal: true }],
    ["wrong report", { report: { ...reviewedReport, id: reviewedReport.reviewed_by } }],
    ["wrong status", { report: { ...reviewedReport, status: "dismissed" } }],
    ["malformed", { report: { ...reviewedReport, reviewed_by: "not-a-uuid" } }],
  ])("rejects a %s 2xx mutation before exposing success", async (_label, payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(payload)));
    const committed: unknown[] = [];

    await expect(updateAdminReport(REPORT_ID, "resolved").then((value) => committed.push(value)))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(committed).toEqual([]);
  });

  it("uses stable queue-preserving recovery copy for network, permission, server, and contract failures", () => {
    expect(moderationReportMutationErrorMessage(
      new ApiTransportError("network", 0, "NETWORK_UNAVAILABLE"),
    )).toBe("Network unavailable. The report remains in this queue.");
    expect(moderationReportMutationErrorMessage(
      new ApiTransportError("forbidden", 403, "FORBIDDEN"),
    )).toBe("You no longer have permission to update this report. The report remains in this queue.");
    expect(moderationReportMutationErrorMessage(
      new ApiTransportError("server", 503, "MODERATION_REVIEW_FAILED"),
    )).toBe("The report service is unavailable. The report remains in this queue.");
    expect(moderationReportMutationErrorMessage(
      new ApiTransportError("invalid", 502, "INVALID_RESPONSE"),
    )).toBe("The server returned an invalid report update. The report remains in this queue.");
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "x-request-id": "admin-report-web" },
  });
}
