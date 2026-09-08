import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mapSource = readFileSync(
  fileURLToPath(new URL("../app/(app)/map.tsx", import.meta.url)),
  "utf8",
);

describe("native map marker wiring", () => {
  it("uses MarkerView press handlers for social cluster and user actions only", () => {
    expect(mapSource.match(/<MapMarkerButton/g)).toHaveLength(2);
    expect(mapSource).toContain("onPress={() => selectCluster(clusterId)}");
    expect(mapSource).toContain("onPress={() => void selectUser(userId)}");
    expect(mapSource).not.toContain("collectBot");
    expect(mapSource).not.toContain("botsQueryOptions");
    expect(mapSource).not.toContain("coinsQuery");
    expect(mapSource).not.toMatch(/onSelected=\{\(\) => (?:void )?(?:selectCluster|selectUser)/);
  });

  it("preserves the accessible visible-marker action sheet", () => {
    expect(mapSource).toContain("<MapMarkerActionSheet");
    expect(mapSource).toContain('accessibilityViewIsModal');
    expect(mapSource).toContain('accessibilityLabel="Visible map markers"');
  });
});
