import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const web = readFileSync(
  new URL("../src/features/chat/useRealtimeDM.ts", import.meta.url),
  "utf8",
);
const native = readFileSync(
  new URL("../apps/native/src/hooks/use-realtime-dm.ts", import.meta.url),
  "utf8",
);

describe.each([
  ["web", web, "fetchThreadMessages"],
  ["iOS/Android", native, "fetchMessages"],
])("%s realtime read-receipt parity", (_platform, source, backfillName) => {
  it("uses the shared active-thread coordinator before durable message backfill", () => {
    const mark = source.indexOf("await markActiveThreadRead(userId, threadToBackfill)");
    const backfill = source.indexOf(`${backfillName}(threadToBackfill, null, signal)`);
    expect(mark).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(mark);
  });

  it("does not amplify the actor's own read broadcast", () => {
    expect(source).toContain(
      'hint.action === "read" && hint.actor_id === userId',
    );
  });
});
