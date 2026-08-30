import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contractFixtureMessage, DEFAULT_API_TIMEOUT_MS, messageMutationResponseSchema } from "@peekpoke/shared";
import { onlineManager } from "@tanstack/react-query";
import { resolveApiUrl } from "@/lib/api-url";
import { ApiRequestError, apiFetch } from "@/lib/api";
import { uploadAndSendChatMedia, uploadChatMedia } from "@/data/chat-upload";

const supabaseOrigin = "https://project.supabase.co";
const uploaderId = "user-id";
const objectStem = "1722501296789-550e8400-e29b-41d4-a716-446655440000";
const signedMainUrl = `${supabaseOrigin}/storage/v1/object/sign/media/${uploaderId}/${objectStem}.jpg?token=main-token`;
const signedThumbnailUrl = `${supabaseOrigin}/storage/v1/object/sign/media/${uploaderId}/${objectStem}_thumb.webp?token=thumb-token`;

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: { apiBaseUrl: "https://www.peek-poke.com" },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});

describe("native API URL boundary", () => {
  it("resolves versioned backend paths on the configured origin", () => {
    expect(resolveApiUrl("https://www.peek-poke.com", "/api/bootstrap"))
      .toBe("https://www.peek-poke.com/api/bootstrap");
  });

  it("rejects cross-origin absolute URLs", () => {
    expect(() => resolveApiUrl(
      "https://www.peek-poke.com",
      "https://attacker.example/api/profile",
    )).toThrow("Cross-origin API requests are not allowed");
  });
});

describe("native API transport", () => {
  it("uses an explicitly bound auth token without consulting mutable session state", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/profile/push-token", {
      authToken: "attempt-bound-token",
      method: "POST",
      body: "{}",
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer attempt-bound-token");
  });

  it.each([
    ["malformed JSON", "{"],
    ["legacy envelope", JSON.stringify({ error: "Forbidden", message: "Forbidden", code: "FORBIDDEN" })],
    ["malformed envelope", JSON.stringify({
      version: "v1",
      error: "Forbidden",
      message: "Forbidden",
      code: "FORBIDDEN",
      request_id: "request body with spaces",
    })],
  ])("strictly normalizes %s", async (_label, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, {
      status: 403,
      headers: { "x-request-id": "request-native-invalid" },
    })));

    await expect(apiFetch("/api/profile", { auth: false })).rejects.toMatchObject({
      name: "ApiRequestError",
      message: "Invalid server response",
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: "request-native-invalid",
    });
  });

  it("surfaces the shared error envelope and request ID", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      version: "v1",
      error: "Forbidden",
      message: "Forbidden",
      code: "FORBIDDEN",
      request_id: "request-native-1",
    }), { status: 403, headers: { "x-request-id": "request-native-header" } })));

    const request = apiFetch("/api/profile", { auth: false });
    await expect(request).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 403,
      code: "FORBIDDEN",
      requestId: "request-native-1",
    });
  });

  it("exposes Retry-After timing without retrying the failed mutation", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: "v1",
      error: "Service temporarily unavailable",
      message: "Service temporarily unavailable",
      code: "RATE_LIMIT_UNAVAILABLE",
      request_id: "request-native-backoff",
    }), {
      status: 503,
      headers: { "retry-after": "8" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/profile", {
      auth: false,
      method: "POST",
      body: JSON.stringify({ display_name: "Ada" }),
    })).rejects.toMatchObject({
      status: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
      requestId: "request-native-backoff",
      retryAfterMs: 8_000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects successful responses that violate the supplied schema", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ profile: 42 }), {
      headers: { "x-request-id": "request-native-2" },
    })));

    const request = apiFetch("/api/profile", {
      auth: false,
      responseSchema: z.object({ profile: z.string() }),
    });
    await expect(request).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: "request-native-2",
    });
  });

  it("rejects a malformed successful chat mutation before it reaches the native cache", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      message: { id: "not-a-uuid" },
    }), { headers: { "x-request-id": "request-native-mutation" } })));

    await expect(apiFetch("/api/dm/thread/message", {
      auth: false,
      method: "DELETE",
      responseSchema: messageMutationResponseSchema,
    })).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: "request-native-mutation",
    });
  });

  it.each([
    ["missing URL", { thumbnailUrl: null }],
    ["wrong URL type", { url: 42, thumbnailUrl: null }],
    ["extra database field", {
      url: "https://media.example/photo.jpg",
      thumbnailUrl: null,
      storage_path: "private/user/photo.jpg",
    }],
  ])("rejects a successful chat upload with %s before any message request", async (_label, payload) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), {
      headers: { "x-request-id": "request-native-upload" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadChatMedia(new FormData(), uploaderId, supabaseOrigin)).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: "request-native-upload",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.peek-poke.com/api/upload",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns a valid canonical chat upload through the native transport", async () => {
    const payload = { url: signedMainUrl, thumbnailUrl: signedThumbnailUrl };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetchMock);

    const formData = new FormData();
    await expect(uploadChatMedia(formData, uploaderId, supabaseOrigin)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.peek-poke.com/api/upload",
      expect.objectContaining({ method: "POST", body: formData }),
    );
  });

  it.each([
    ["foreign", signedMainUrl.replace(uploaderId, "other-user")],
    ["encoded", signedMainUrl.replace(uploaderId, "%75ser-id")],
    ["case-variant", signedMainUrl.replace(uploaderId, "User-id")],
    ["literal dot traversal", signedMainUrl.replace(`${objectStem}.jpg`, `ignored/../${objectStem}.jpg`)],
    ["lowercase encoded dot traversal", signedMainUrl.replace(`${objectStem}.jpg`, `ignored/%2e%2e/${objectStem}.jpg`)],
    ["mixed-case encoded dot traversal", signedMainUrl.replace(`${objectStem}.jpg`, `ignored/%2E%2e/${objectStem}.jpg`)],
    ["encoded slash traversal", signedMainUrl.replace(`${objectStem}.jpg`, `ignored%2f..%2F${objectStem}.jpg`)],
    ["double-encoded traversal", signedMainUrl.replace(`${objectStem}.jpg`, `ignored/%252e%252e%252f${objectStem}.jpg`)],
    ["arbitrary object stem", signedMainUrl.replace(`${objectStem}.jpg`, "object-id.jpg")],
    ["non-v4 UUID", signedMainUrl.replace("-41d4-", "-11d4-")],
    ["uppercase UUID", signedMainUrl.replace("550e8400", "550E8400")],
    ["uppercase extension", signedMainUrl.replace(".jpg", ".JPG")],
    ["executable extension", signedMainUrl.replace(".jpg", ".exe")],
    ["extra dot suffix", signedMainUrl.replace(".jpg", ".tar.jpg")],
  ])("does not send a DM when a 200 upload response has a %s uploader directory", async (_label, url) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      url,
      thumbnailUrl: null,
    })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadAndSendChatMedia(
      new FormData(),
      uploaderId,
      () => apiFetch("/api/dm/thread", {
        auth: false,
        method: "POST",
        responseSchema: messageMutationResponseSchema,
      }),
      supabaseOrigin,
    )).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetchMock.mock.calls.filter(([input]) => input === "https://www.peek-poke.com/api/upload"))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => input === "https://www.peek-poke.com/api/dm/thread"))
      .toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["different stem", signedThumbnailUrl.replace(objectStem, "1722501296790-550e8400-e29b-41d4-a716-446655440000")],
    ["missing thumbnail suffix", signedThumbnailUrl.replace("_thumb.webp", ".webp")],
    ["uppercase thumbnail suffix", signedThumbnailUrl.replace("_thumb.webp", "_THUMB.webp")],
    ["uppercase thumbnail extension", signedThumbnailUrl.replace(".webp", ".WEBP")],
  ])("does not send a DM when a 200 upload response has a %s", async (_label, thumbnailUrl) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      url: signedMainUrl,
      thumbnailUrl,
    })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadAndSendChatMedia(
      new FormData(),
      uploaderId,
      () => apiFetch("/api/dm/thread", {
        auth: false,
        method: "POST",
        responseSchema: messageMutationResponseSchema,
      }),
      supabaseOrigin,
    )).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetchMock.mock.calls.filter(([input]) => input === "https://www.peek-poke.com/api/upload"))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => input === "https://www.peek-poke.com/api/dm/thread"))
      .toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uploads once and sends one DM for matching signed main and thumbnail URLs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "https://www.peek-poke.com/api/upload") {
        return new Response(JSON.stringify({ url: signedMainUrl, thumbnailUrl: signedThumbnailUrl }));
      }
      return new Response(JSON.stringify({ message: contractFixtureMessage }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadAndSendChatMedia(
      new FormData(),
      uploaderId,
      () => apiFetch("/api/dm/thread", {
        auth: false,
        method: "POST",
        responseSchema: messageMutationResponseSchema,
      }),
      supabaseOrigin,
    )).resolves.toEqual({ message: contractFixtureMessage });
    expect(fetchMock.mock.calls.filter(([input]) => input === "https://www.peek-poke.com/api/upload"))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => input === "https://www.peek-poke.com/api/dm/thread"))
      .toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("drops unsafe response request IDs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{", {
      status: 500,
      headers: { "x-request-id": "unsafe request id" },
    })));

    await expect(apiFetch("/api/profile", { auth: false })).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: null,
    });
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("preserves caller cancellation instead of reporting an offline failure", async () => {
    onlineManager.setOnline(false);
    const controller = new AbortController();
    const reason = new Error("query cancelled");
    vi.stubGlobal("fetch", vi.fn((_input, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })));

    const request = apiFetch("/api/bootstrap", { auth: false, signal: controller.signal });
    controller.abort(reason);

    await expect(request).rejects.toBe(reason);
    expect(onlineManager.isOnline()).toBe(false);
  });

  it("fails a stalled request with a stable timeout code", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_input, init?: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => new Promise<string>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    } as Response)));

    const request = apiFetch("/api/bootstrap", { auth: false, timeoutMs: 25 });
    const assertion = expect(request).rejects.toEqual(expect.objectContaining<ApiRequestError>({
      status: 0,
      code: "REQUEST_TIMEOUT",
    }));
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  it("applies the default timeout before response headers and marks native offline", async () => {
    vi.useFakeTimers();
    onlineManager.setOnline(true);
    vi.stubGlobal("fetch", vi.fn((_input, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })));

    const request = apiFetch("/api/bootstrap", { auth: false });
    const assertion = expect(request).rejects.toEqual(expect.objectContaining<ApiRequestError>({
      status: 0,
      code: "REQUEST_TIMEOUT",
      requestId: null,
    }));
    await vi.advanceTimersByTimeAsync(DEFAULT_API_TIMEOUT_MS);
    await assertion;
    expect(onlineManager.isOnline()).toBe(false);
  });

  it("keeps native online and preserves the request ID when a response body times out", async () => {
    vi.useFakeTimers();
    onlineManager.setOnline(false);
    vi.stubGlobal("fetch", vi.fn(async (_input, init?: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers({ "x-request-id": "request-native-body-timeout" }),
      text: () => new Promise<string>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    } as Response)));

    const request = apiFetch("/api/bootstrap", { auth: false, timeoutMs: 25 });
    const assertion = expect(request).rejects.toMatchObject({
      status: 0,
      code: "REQUEST_TIMEOUT",
      requestId: "request-native-body-timeout",
    });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("marks native offline only when the network fails before a response", async () => {
    onlineManager.setOnline(true);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("socket detail");
    }));

    await expect(apiFetch("/api/bootstrap", { auth: false })).rejects.toMatchObject({
      message: "Network unavailable",
      status: 0,
      code: "NETWORK_UNAVAILABLE",
      requestId: null,
    });
    expect(onlineManager.isOnline()).toBe(false);
  });
});
