import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mapSource = readFileSync(
  fileURLToPath(new URL("../app/(app)/map.tsx", import.meta.url)),
  "utf8",
);

describe("native map route retirement", () => {
  it("does not expose map-based presence from the QR-room client", () => {
    expect(mapSource).toContain("/(app)/rooms");
    expect(mapSource).toContain("Legacy route");
    expect(mapSource).not.toContain("MapMarkerButton");
  });
});
