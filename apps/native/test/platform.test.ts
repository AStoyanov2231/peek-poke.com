import { describe, expect, it } from "vitest";
import { currentNativePlatform } from "@/lib/platform";

describe("native platform branch", () => {
  it("uses the platform selected by the native test command", () => {
    const expected = process.env.NATIVE_TEST_PLATFORM === "ios" ? "ios" : "android";
    expect(currentNativePlatform()).toBe(expected);
  });
});
