import { describe, expect, it } from "vitest";
import {
  ApiTransportError,
  safeQueryRetryDelay,
  shouldRetrySafeQuery,
} from "@peekpoke/shared";

describe("shared safe query retry policy", () => {
  it.each([401, 403, 404, 429])("never retries HTTP %i", (status) => {
    const error = new ApiTransportError("Request failed", status, "REQUEST_FAILED");
    expect(shouldRetrySafeQuery(0, error)).toBe(false);
  });

  it("retries only bounded network and 5xx query failures", () => {
    expect(shouldRetrySafeQuery(0, new ApiTransportError("Offline", 0, "NETWORK_UNAVAILABLE"))).toBe(true);
    expect(shouldRetrySafeQuery(1, new ApiTransportError("Unavailable", 503, "SERVICE_UNAVAILABLE"))).toBe(true);
    expect(shouldRetrySafeQuery(2, new ApiTransportError("Unavailable", 503, "SERVICE_UNAVAILABLE"))).toBe(false);
    expect(shouldRetrySafeQuery(0, new Error("Application failure"))).toBe(false);
  });

  it("honors bounded Retry-After for retryable 5xx and otherwise backs off", () => {
    expect(safeQueryRetryDelay(
      0,
      new ApiTransportError("Unavailable", 503, "SERVICE_UNAVAILABLE", null, 11_000),
    )).toBe(11_000);
    expect(safeQueryRetryDelay(
      0,
      new ApiTransportError("Unavailable", 503, "SERVICE_UNAVAILABLE", null, 60_000),
    )).toBe(30_000);
    expect(safeQueryRetryDelay(
      0,
      new ApiTransportError("Unavailable", 503, "SERVICE_UNAVAILABLE"),
    )).toBe(1_000);
    expect(safeQueryRetryDelay(0, new ApiTransportError("Offline", 0, "NETWORK_UNAVAILABLE"))).toBe(1_000);
    expect(safeQueryRetryDelay(1, new ApiTransportError("Offline", 0, "NETWORK_UNAVAILABLE"))).toBe(2_000);
    expect(safeQueryRetryDelay(20, new ApiTransportError("Offline", 0, "NETWORK_UNAVAILABLE"))).toBe(30_000);
  });
});
