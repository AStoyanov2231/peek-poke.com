import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_VERSION,
  contractFixtureMessage,
  contractFixtureThread,
} from "@peekpoke/shared";
import { fetchThreadMessages, threadQueryOptions } from "@/data/web-query";

afterEach(() => vi.unstubAllGlobals());

describe("web Realtime durable backfill transport", () => {
  it("loads only the latest bounded API page and disables automatic multi-page reconnect", async () => {
    const payload = {
      thread: contractFixtureThread,
      messages: [contractFixtureMessage],
      pagination: {
        version: API_VERSION,
        next_cursor: null,
        has_more: false,
        limit: 100,
      },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchThreadMessages(contractFixtureThread.id)).resolves.toEqual(payload);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/dm/${contractFixtureThread.id}?limit=100`,
    );
    expect(threadQueryOptions(contractFixtureThread.id).refetchOnReconnect).toBe(false);
  });
});
