import { describe, expect, it } from "vitest";
import { isOutboxRequestAuthorized } from "@/server/outbox/auth";

describe("outbox worker authorization", () => {
  it("requires an exactly matching bearer token", () => {
    expect(isOutboxRequestAuthorized("Bearer worker-secret", "worker-secret")).toBe(true);
    expect(isOutboxRequestAuthorized("Bearer wrong-secret", "worker-secret")).toBe(false);
    expect(isOutboxRequestAuthorized("Basic worker-secret", "worker-secret")).toBe(false);
  });

  it("fails closed when the worker secret is missing", () => {
    expect(isOutboxRequestAuthorized("Bearer worker-secret", undefined)).toBe(false);
    expect(isOutboxRequestAuthorized(null, "worker-secret")).toBe(false);
  });
});
