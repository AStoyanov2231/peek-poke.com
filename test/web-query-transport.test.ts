import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebQueryClient } from "@/data/web-query-client";
import { fetchAdminCoins, fetchAdminReports, fetchModerationPhotos } from "@/data/admin-query";
import { fetchTagSuggestions } from "@/features/search/useTagSuggestions";
import { fetchUserSearch } from "@/features/search/useUserSearch";
import { fetchResolvedTags } from "@/lib/search/resolveTagIds";

afterEach(() => {
  vi.unstubAllGlobals();
});

const webReads = [
  ["tag suggestions", (signal: AbortSignal) => fetchTagSuggestions("music", signal)],
  ["tag resolution", (signal: AbortSignal) => fetchResolvedTags(["music"], signal)],
  ["user search", (signal: AbortSignal) => fetchUserSearch({
    nameQuery: "andy",
    tagIds: [],
    nearbyIds: [],
  }, signal)],
  ["moderation reports", (signal: AbortSignal) => fetchAdminReports("pending", signal)],
  ["moderation photos", (signal: AbortSignal) => fetchModerationPhotos("pending", 1, signal)],
  ["admin coins", (signal: AbortSignal) => fetchAdminCoins(signal)],
] as const;

describe("web QueryClient-owned transport reads", () => {
  it.each(webReads)("retries bounded 5xx failures for %s", async (_label, read) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: "v1",
      error: "Service unavailable",
      message: "Service unavailable",
      code: "SERVICE_UNAVAILABLE",
      request_id: "request-web-read-503",
    }), {
      status: 503,
      headers: { "retry-after": "0" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createWebQueryClient();

    await expect(client.fetchQuery({
      queryKey: ["transport-read", _label],
      queryFn: ({ signal }) => read(signal),
    })).rejects.toMatchObject({
      name: "ApiTransportError",
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      requestId: "request-web-read-503",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403, 404, 429])("does not retry HTTP %i", async (status) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: "v1",
      error: "Request rejected",
      message: "Request rejected",
      code: "REQUEST_REJECTED",
      request_id: `request-web-read-${status}`,
    }), { status }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createWebQueryClient();

    await expect(client.fetchQuery({
      queryKey: ["transport-read-status", status],
      queryFn: ({ signal }) => fetchTagSuggestions("music", signal),
    })).rejects.toMatchObject({ status, code: "REQUEST_REJECTED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
