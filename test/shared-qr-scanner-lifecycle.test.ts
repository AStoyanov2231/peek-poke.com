import { describe, expect, it } from "vitest";
import {
  MAX_SHARED_GROUP_QR_CONTENT_LENGTH,
  sharedGroupQrContentError,
} from "@peekpoke/shared";

describe("shared QR scanner input behavior", () => {
  it.each([
    ["empty", "", "empty"],
    ["NUL-containing", "safe\u0000text", "nul"],
    ["oversized", "x".repeat(MAX_SHARED_GROUP_QR_CONTENT_LENGTH + 1), "too_long"],
  ] as const)("rejects %s payloads before submission", (_label, content, error) => {
    expect(sharedGroupQrContentError(content)).toBe(error);
  });

  it.each([
    "  https://example.invalid/qr?id=7  ",
    "plain text QR content",
    "\u0001control text is still bounded text",
  ])("accepts exact bounded QR text without interpreting it", (content) => {
    expect(sharedGroupQrContentError(content)).toBeNull();
  });

  it("accepts the maximum bounded payload", () => {
    expect(sharedGroupQrContentError("x".repeat(MAX_SHARED_GROUP_QR_CONTENT_LENGTH))).toBeNull();
  });
});
