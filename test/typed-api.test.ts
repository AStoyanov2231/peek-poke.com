import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiTransportError,
  contractFixtureMessage,
  DEFAULT_API_TIMEOUT_MS,
  messageMutationResponseSchema,
  onboardingCompleteResponseSchema,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";
import { uploadAndSendChatMedia, uploadChatMedia } from "@/features/chat/upload-chat-media";

const supabaseOrigin = "https://project.supabase.co";
const uploaderId = "user-id";
const objectStem = "1722501296789-550e8400-e29b-41d4-a716-446655440000";
const signedMainUrl = `${supabaseOrigin}/storage/v1/object/sign/media/${uploaderId}/${objectStem}.jpg?token=main-token`;
const signedThumbnailUrl = `${supabaseOrigin}/storage/v1/object/sign/media/${uploaderId}/${objectStem}_thumb.webp?token=thumb-token`;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("web typed API transport", () => {
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
      headers: { "x-request-id": "request-web-invalid" },
    })));

    await expect(fetchContract("/api/bootstrap", z.unknown())).rejects.toMatchObject({
      name: "ApiTransportError",
      message: "Invalid server response",
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: "request-web-invalid",
    });
  });

  it("uses the shared error envelope and request ID", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      version: "v1",
      error: "Unauthorized",
      message: "Unauthorized",
      code: "UNAUTHORIZED",
      request_id: "request-web-1",
    }), { status: 401, headers: { "x-request-id": "request-web-header" } })));

    await expect(fetchContract("/api/bootstrap", z.object({ ok: z.boolean() })))
      .rejects.toMatchObject({
        name: "ApiTransportError",
        status: 401,
        code: "UNAUTHORIZED",
        requestId: "request-web-1",
      });
  });

  it.each(["-1", "1.5", "9007199254741", "next Tuesday"])(
    "discards unsafe Retry-After metadata without changing the canonical failure (%s)",
    async (retryAfter) => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
        version: "v1",
        error: "Too many requests",
        message: "Too many requests",
        code: "RATE_LIMITED",
        request_id: "request-web-rate-limit",
      }), {
        status: 429,
        headers: { "retry-after": retryAfter },
      })));

      await expect(fetchContract("/api/bootstrap", z.unknown())).rejects.toMatchObject({
        status: 429,
        code: "RATE_LIMITED",
        requestId: "request-web-rate-limit",
        retryAfterMs: null,
      });
    },
  );

  it("normalizes malformed successful payloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: "yes" }), {
      headers: { "x-request-id": "request-web-2" },
    })));

    await expect(fetchContract("/api/bootstrap", z.object({ ok: z.boolean() })))
      .rejects.toEqual(expect.objectContaining<ApiTransportError>({
        status: 502,
        code: "INVALID_RESPONSE",
        requestId: "request-web-2",
      }));
  });

  it("rejects a malformed successful chat mutation before it reaches the web cache", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      message: { id: "not-a-uuid" },
    }), { headers: { "x-request-id": "request-web-mutation" } })));

    await expect(fetchContract(
      "/api/dm/thread/message",
      messageMutationResponseSchema,
      { method: "PATCH" },
    )).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: "request-web-mutation",
    });
  });

  it("rejects malformed onboarding completion before web navigation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: true,
      profile: { username: "alice", onboarding_completed: true },
    }), { headers: { "x-request-id": "request-web-onboarding" } })));

    await expect(fetchContract(
      "/api/profile/complete-onboarding",
      onboardingCompleteResponseSchema,
      { method: "POST" },
    )).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: "request-web-onboarding",
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
      headers: { "x-request-id": "request-web-upload" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadChatMedia(new FormData(), uploaderId, supabaseOrigin)).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: "request-web-upload",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/upload", expect.objectContaining({ method: "POST" }));
  });

  it("returns a valid canonical chat upload through the web transport", async () => {
    const payload = { url: signedMainUrl, thumbnailUrl: signedThumbnailUrl };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetchMock);

    const formData = new FormData();
    await expect(uploadChatMedia(formData, uploaderId, supabaseOrigin)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload",
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
      () => fetchContract("/api/dm/thread", messageMutationResponseSchema, { method: "POST" }),
      supabaseOrigin,
    )).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.filter(([input]) => input === "/api/upload")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => input === "/api/dm/thread")).toHaveLength(0);
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
      () => fetchContract("/api/dm/thread", messageMutationResponseSchema, { method: "POST" }),
      supabaseOrigin,
    )).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetchMock.mock.calls.filter(([input]) => input === "/api/upload")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => input === "/api/dm/thread")).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uploads once and sends one DM for matching signed main and thumbnail URLs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/upload") {
        return new Response(JSON.stringify({ url: signedMainUrl, thumbnailUrl: signedThumbnailUrl }));
      }
      return new Response(JSON.stringify({ message: contractFixtureMessage }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadAndSendChatMedia(
      new FormData(),
      uploaderId,
      () => fetchContract("/api/dm/thread", messageMutationResponseSchema, { method: "POST" }),
      supabaseOrigin,
    )).resolves.toEqual({ message: contractFixtureMessage });
    expect(fetchMock.mock.calls.filter(([input]) => input === "/api/upload")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => input === "/api/dm/thread")).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("drops unsafe response request IDs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{", {
      status: 500,
      headers: { "x-request-id": "unsafe request id" },
    })));

    await expect(fetchContract("/api/bootstrap", z.unknown())).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: null,
    });
  });

  it("preserves caller cancellation", async () => {
    const controller = new AbortController();
    const reason = new Error("query cancelled");
    vi.stubGlobal("fetch", vi.fn((_input, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })));

    const request = fetchContract("/api/bootstrap", z.unknown(), { signal: controller.signal });
    controller.abort(reason);

    await expect(request).rejects.toBe(reason);
  });

  it("times out stalled requests", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_input, init?: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => new Promise<string>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    } as Response)));

    const request = fetchContract("/api/bootstrap", z.unknown(), { timeoutMs: 25 });
    const assertion = expect(request).rejects.toEqual(expect.objectContaining<ApiTransportError>({
      status: 0,
      code: "REQUEST_TIMEOUT",
    }));
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  it("applies the default timeout before response headers arrive", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })));

    const request = fetchContract("/api/bootstrap", z.unknown());
    const assertion = expect(request).rejects.toEqual(expect.objectContaining<ApiTransportError>({
      status: 0,
      code: "REQUEST_TIMEOUT",
      requestId: null,
    }));
    await vi.advanceTimersByTimeAsync(DEFAULT_API_TIMEOUT_MS);
    await assertion;
  });

  it("keeps the response request ID when the body times out", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_input, init?: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers({ "x-request-id": "request-web-body-timeout" }),
      text: () => new Promise<string>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    } as Response)));

    const request = fetchContract("/api/bootstrap", z.unknown(), { timeoutMs: 25 });
    const assertion = expect(request).rejects.toMatchObject({
      status: 0,
      code: "REQUEST_TIMEOUT",
      requestId: "request-web-body-timeout",
    });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });
});
