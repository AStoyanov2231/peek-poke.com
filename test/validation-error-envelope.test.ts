import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiErrorEnvelopeSchema, contractErrorFailure } from "@peekpoke/shared/errors";
import { fetchContract } from "@/lib/typed-api";
import { apiFetch } from "../apps/native/src/lib/api";
import { apiError } from "@/lib/api-error";
import { MAX_JSON_BODY_BYTES } from "@/lib/validators";

const REQUEST_ID = "request-validation-1";
const USER_ID = "11111111-1111-4111-8111-111111111111";

const routeMocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(async () => null),
  from: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/auth", async () => {
  const { withRequestContext } = await vi.importActual<
    typeof import("@/lib/request-context")
  >("@/lib/request-context");

  return {
    withAuth: (
      handler: (request: Request, context: unknown) => Promise<Response>,
    ) => withRequestContext((request: Request) => handler(request, {
      user: { id: USER_ID },
      supabase: {},
    })),
  };
});

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: routeMocks.enforceRateLimit,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: routeMocks.from }),
}));

vi.mock("../apps/native/src/lib/env", () => ({
  env: { apiBaseUrl: "https://www.peek-poke.com" },
}));

vi.mock("../apps/native/src/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

import { POST } from "@/app/api/profile/interests/route";

beforeEach(() => {
  routeMocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  routeMocks.insert.mockReset();
  routeMocks.from.mockReset().mockReturnValue({ insert: routeMocks.insert });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function captureResponse(response: Response) {
  const body = await response.text();
  const status = response.status;
  const headers = [...response.headers.entries()];
  return () => new Response(body, { status, headers });
}

function streamedBody(size: number) {
  const chunkSize = 32 * 1024;
  let emitted = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (emitted >= size) {
        controller.close();
        return;
      }
      const length = Math.min(chunkSize, size - emitted);
      emitted += length;
      controller.enqueue(new Uint8Array(length));
    },
  });
}

async function expectValidationFailure(
  request: Request,
  expected: { status: number; code: string; message: string },
) {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const response = await POST(request, {} as never);
  await expectTransportFailure(response, expected);

  expect(routeMocks.enforceRateLimit).toHaveBeenCalledTimes(1);
  expect(routeMocks.enforceRateLimit).toHaveBeenCalledWith("profileMutation", USER_ID);
  expect(routeMocks.from).not.toHaveBeenCalled();
  expect(routeMocks.insert).not.toHaveBeenCalled();
}

async function expectTransportFailure(
  response: Response,
  expected: {
    status: number;
    code: string;
    message: string;
    retryAfterMs?: number | null;
  },
) {
  const replayResponse = await captureResponse(response);
  const payload = apiErrorEnvelopeSchema.parse(await replayResponse().json());

  expect(response.status).toBe(expected.status);
  expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
  expect(payload).toEqual({
    version: "v1",
    error: expected.message,
    message: expected.message,
    code: expected.code,
    request_id: REQUEST_ID,
  });

  const expectedFailure = {
    message: expected.message,
    status: expected.status,
    code: expected.code,
    requestId: REQUEST_ID,
    retryAfterMs: expected.retryAfterMs ?? null,
  };
  expect(contractErrorFailure(
    payload,
    response.status,
    response.headers.get("x-request-id"),
    response.headers.get("retry-after"),
  ))
    .toEqual(expectedFailure);

  const fetchMock = vi.fn()
    .mockImplementationOnce(async () => replayResponse())
    .mockImplementationOnce(async () => replayResponse());
  vi.stubGlobal("fetch", fetchMock);

  await expect(fetchContract("/api/profile/interests", z.unknown())).rejects
    .toMatchObject(expectedFailure);
  await expect(apiFetch("/api/profile/interests", { auth: false })).rejects
    .toMatchObject(expectedFailure);
  expect(fetchMock).toHaveBeenCalledTimes(2);
}

function request(body: BodyInit, headers: HeadersInit = {}) {
  return new Request("https://example.test/api/profile/interests", {
    method: "POST",
    body,
    headers: { "x-request-id": REQUEST_ID, ...headers },
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function requestWithoutBody() {
  return new Request("https://example.test/api/profile/interests", {
    method: "POST",
    headers: { "x-request-id": REQUEST_ID },
  });
}

function failingBody() {
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new Error("sensitive stream failure"));
    },
  });
}

describe("JSON validation error envelopes", () => {
  it.each([
    {
      label: "rate-limit rejection",
      status: 429,
      code: "RATE_LIMITED",
      message: "Too many requests",
      retryAfter: "27",
      retryAfterMs: 27_000,
    },
    {
      label: "rate-limit provider failure",
      status: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
      message: "Service temporarily unavailable",
      retryAfter: "5",
      retryAfterMs: 5_000,
    },
    {
      label: "dated provider backoff",
      status: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
      message: "Service temporarily unavailable",
      retryAfter: "Thu, 06 Aug 2026 12:00:30 GMT",
      retryAfterMs: 30_000,
      now: "2026-08-06T12:00:00.000Z",
    },
  ])("preserves the canonical $label response across web and native transports", async ({
    status,
    code,
    message,
    retryAfter,
    retryAfterMs,
    now,
  }) => {
    if (now) {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    }
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    routeMocks.enforceRateLimit.mockImplementationOnce(async () => {
      const response = apiError(message, status, code);
      response.headers.set("Retry-After", retryAfter);
      if (status === 429) {
        response.headers.set("X-RateLimit-Limit", "20");
        response.headers.set("X-RateLimit-Remaining", "0");
      }
      return response;
    });

    const response = await POST(request(JSON.stringify({ tag_id: USER_ID })), {} as never);

    expect(response.headers.get("retry-after")).toBe(retryAfter);
    if (status === 429) {
      expect(response.headers.get("x-ratelimit-limit")).toBe("20");
      expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
    }
    await expectTransportFailure(response, { status, code, message, retryAfterMs });
    expect(routeMocks.enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(routeMocks.enforceRateLimit).toHaveBeenCalledWith("profileMutation", USER_ID);
    expect(routeMocks.from).not.toHaveBeenCalled();
    expect(routeMocks.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["no body", () => requestWithoutBody()],
    ["an empty body", () => request("")],
  ])("normalizes %s", async (_label, makeRequest) => {
    await expectValidationFailure(makeRequest(), {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid input: expected object, received undefined",
    });
  });

  it("normalizes malformed JSON", async () => {
    await expectValidationFailure(request("{"), {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid request body",
    });
  });

  it("normalizes Zod rejection without losing the original status", async () => {
    await expectValidationFailure(request(JSON.stringify({ tag_id: "not-a-uuid" })), {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid UUID",
    });
  });

  it.each([
    ["JSON null", null, "Invalid input: expected object, received null"],
    ["an array", [], "Invalid input: expected object, received array"],
    ["a string", "tag", "Invalid input: expected object, received string"],
    ["a number", 1, "Invalid input: expected object, received number"],
    ["a boolean", true, "Invalid input: expected object, received boolean"],
    ["a missing tag_id", {}, "Invalid input: expected string, received undefined"],
    ["a wrong-type tag_id", { tag_id: 1 }, "Invalid input: expected string, received number"],
  ])("normalizes %s", async (_label, body, message) => {
    await expectValidationFailure(request(JSON.stringify(body)), {
      status: 400,
      code: "VALIDATION_ERROR",
      message,
    });
  });

  it.each(["not-a-number", "1e2", " "])("rejects invalid Content-Length %j safely", async (value) => {
    await expectValidationFailure(request("{}", { "content-length": value }), {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid request body",
    });
  });

  it("rejects a declared oversized body before reading it", async () => {
    await expectValidationFailure(request("{}", {
      "content-length": String(MAX_JSON_BODY_BYTES + 1),
    }), {
      status: 413,
      code: "REQUEST_BODY_TOO_LARGE",
      message: "Request body too large",
    });
  });

  it("rejects an oversized streamed body without Content-Length", async () => {
    await expectValidationFailure(request(streamedBody(MAX_JSON_BODY_BYTES + 1)), {
      status: 413,
      code: "REQUEST_BODY_TOO_LARGE",
      message: "Request body too large",
    });
  });

  it("rejects a streamed body larger than its under-declared Content-Length", async () => {
    await expectValidationFailure(request(streamedBody(MAX_JSON_BODY_BYTES + 1), {
      "content-length": "2",
    }), {
      status: 413,
      code: "REQUEST_BODY_TOO_LARGE",
      message: "Request body too large",
    });
  });

  it("normalizes a stream read failure through request context", async () => {
    await expectValidationFailure(request(failingBody()), {
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    });
  });
});
