import { beforeAll, describe, expect, it } from "vitest";

let planShareTokenFromQrContent: typeof import("@/lib/plan-share-link").planShareTokenFromQrContent;

beforeAll(async () => {
  Object.assign(globalThis, { __DEV__: false });
  ({ planShareTokenFromQrContent } = await import("@/lib/plan-share-link"));
});

const token = "a".repeat(43);

describe("plan share QR links", () => {
  it("accepts only an allowlisted HTTPS plan token URL", () => {
    expect(
      planShareTokenFromQrContent(`https://www.peek-poke.com/plan/${token}`),
    ).toBe(token);
  });

  it("rejects arbitrary QR data, variants, and unsafe URLs", () => {
    expect(
      planShareTokenFromQrContent(`https://evil.example/plan/${token}`),
    ).toBeNull();
    expect(
      planShareTokenFromQrContent(
        `https://www.peek-poke.com/plan/${token}?join=1`,
      ),
    ).toBeNull();
    expect(
      planShareTokenFromQrContent(`http://www.peek-poke.com/plan/${token}`),
    ).toBeNull();
    expect(planShareTokenFromQrContent("shared-group-code")).toBeNull();
  });
});
