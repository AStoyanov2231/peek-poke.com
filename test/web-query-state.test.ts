import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createWebQueryClient } from "../src/data/web-query-client";
import { fetchJson } from "../src/lib/typed-api";
import {
  bootstrapQueryOptions,
  friendsQueryOptions,
  nearbyQueryOptions,
  profileQueryOptions,
  webQueryKeys,
} from "../src/data/web-query";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web remote-state queries", () => {
  it.each([
    {
      label: "principal profile",
      options: profileQueryOptions,
      expectedPath: "/api/profile",
      status: 429,
      code: "RATE_LIMITED",
      retryAfter: "7",
    },
    {
      label: "nearby discovery",
      options: nearbyQueryOptions(
        { lat: 42.6977, lng: 23.3219 },
        "11111111-1111-4111-8111-111111111111",
      ),
      expectedPath: "/api/nearby",
      status: 429,
      code: "RATE_LIMITED",
      retryAfter: "13",
    },
  ])("preserves the canonical transport error on $label", async ({
    options,
    expectedPath,
    status,
    code,
    retryAfter,
  }) => {
    const requestId = `request-web-${status}`;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: "v1",
      error: "Please try again later",
      message: "Please try again later",
      code,
      request_id: requestId,
    }), {
      status,
      headers: { "retry-after": retryAfter },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createWebQueryClient();

    await expect(client.fetchQuery(options)).rejects.toMatchObject({
      name: "ApiTransportError",
      message: "Please try again later",
      status,
      code,
      requestId,
      retryAfterMs: Number(retryAfter) * 1_000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expectedPath, expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });

  it("retries a retryable 503 with the production policy", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: "v1",
      error: "Please try again later",
      message: "Please try again later",
      code: "SERVICE_UNAVAILABLE",
      request_id: "request-web-503",
    }), {
      status: 503,
      headers: { "retry-after": "0" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createWebQueryClient();

    await expect(client.fetchQuery(friendsQueryOptions)).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      retryAfterMs: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("normalizes search query keys so equivalent requests deduplicate", () => {
    expect(
      webQueryKeys.userSearch("andy", ["b", "a"], ["2", "1"]),
    ).toEqual(
      webQueryKeys.userSearch("andy", ["a", "b"], ["1", "2"]),
    );
  });

  it("executes a failing 503 mutation exactly once and retains its canonical error", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: "v1",
      error: "Service unavailable",
      message: "Service unavailable",
      code: "SERVICE_UNAVAILABLE",
      request_id: "request-web-mutation-503",
    }), {
      status: 503,
      headers: { "retry-after": "0" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createWebQueryClient();
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ["web", "mutation-retry-evidence"],
      mutationFn: () => fetchJson("/api/mutation-retry-evidence", { method: "POST" }),
    });

    const execution = mutation.execute(undefined);

    await expect(execution).rejects.toMatchObject({
      name: "ApiTransportError",
      message: "Service unavailable",
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      requestId: "request-web-mutation-503",
      retryAfterMs: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mutation-retry-evidence",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mutation.state.failureCount).toBe(1);
    expect(mutation.state.error).toMatchObject({
      name: "ApiTransportError",
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      requestId: "request-web-mutation-503",
    });
  });

  it("coalesces concurrent bootstrap requests through one query key", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(async () => {
      await pending;
      return new Response(JSON.stringify({
        version: "v1",
        identity: { id: "11111111-1111-4111-8111-111111111111", email: "a@example.com" },
        onboarding_completed: true,
        roles: ["user"],
        feature_config_version: "v1",
        unread_summary: { threads: 0 },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient();

    const first = client.fetchQuery(bootstrapQueryOptions);
    const second = client.fetchQuery(bootstrapQueryOptions);
    release?.();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes cancellation to the underlying bootstrap request", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_input, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => reject(requestSignal?.reason));
      });
    }));
    const client = new QueryClient();

    const request = client.fetchQuery(bootstrapQueryOptions);
    await client.cancelQueries({ queryKey: webQueryKeys.bootstrap });

    expect(requestSignal?.aborted).toBe(true);
    await expect(request).rejects.toBeDefined();
  });
});
