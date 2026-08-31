import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const web = readFileSync(
  "src/features/chat/components/ChatSheetContent.tsx",
  "utf8",
);
const webComposer = readFileSync(
  "src/features/chat/components/ChatComposer.tsx",
  "utf8",
);
const native = readFileSync(
  "apps/native/app/chat/[threadId].tsx",
  "utf8",
);

describe("cross-platform DM mutation recovery UI", () => {
  it("offers an announced web delete retry and explicit cancellation", () => {
    expect(web).toContain('role="alert"');
    expect(web).toContain("Retry delete");
    expect(web).toContain("messageMutations.cancel()");
    expect(web).not.toContain('console.error("Failed to delete message:"');
  });

  it("keeps web edit failure visible with Save retry and Cancel edit", () => {
    expect(webComposer).toContain('role={editError ? "alert" : undefined}');
    expect(webComposer).toContain("Press Save to retry.");
    expect(webComposer).toContain('aria-label="Cancel edit"');
  });

  it("offers native Alert retry/cancel and fences stale callbacks", () => {
    expect(native).toContain('Alert.alert(\n        "Delete failed"');
    expect(native).toContain('text: "Cancel"');
    expect(native).toContain('text: "Retry"');
    expect(native).toContain("messageMutations.isGenerationCurrent(retryAttempt)");
    expect(native).toContain('accessibilityLiveRegion="polite"');
    expect(native).toContain("Tap Save edit to retry.");
  });
});
