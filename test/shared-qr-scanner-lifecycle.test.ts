import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const web = readFileSync(
  new URL("../src/features/map/components/QrScannerDialog.tsx", import.meta.url),
  "utf8",
);
const native = readFileSync(
  new URL("../apps/native/src/components/qr-scanner.tsx", import.meta.url),
  "utf8",
);

describe.each([
  ["web", web],
  ["Expo", native],
])("%s QR scanner lifecycle", (_platform, source) => {
  it("bounds and validates untrusted decoded content before joining", () => {
    expect(source).toContain("MAX_SHARED_GROUP_QR_CONTENT_LENGTH");
    expect(source).toContain("content.length > MAX_SHARED_GROUP_QR_CONTENT_LENGTH");
    expect(source).toContain("content.includes(\"\\u0000\")");
    expect(source).toContain("never opens QR links");
  });

  it("guards repeated frame detections and releases camera work", () => {
    expect(source).toContain("submittingRef.current");
    expect(source).toContain("setState(\"submitting\")");
    if (source === web) {
      expect(source).toContain("track.stop()");
      expect(source).toContain("document.addEventListener(\"visibilitychange\"");
      expect(source).toContain("return () => {");
    } else {
      expect(source).toContain("active={open && state === \"scanning\"}");
      expect(source).toContain("AppState.addEventListener(\"change\"");
      expect(source).toContain("onClose()");
    }
  });
});
