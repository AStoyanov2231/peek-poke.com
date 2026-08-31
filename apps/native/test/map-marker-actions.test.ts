import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mapSource = readFileSync(
  fileURLToPath(new URL("../app/(app)/map.tsx", import.meta.url)),
  "utf8",
);

describe("native map marker wiring", () => {
  it("uses MarkerView press handlers for cluster, user, and coin actions", () => {
    expect(mapSource.match(/<MapMarkerButton/g)).toHaveLength(3);
    expect(mapSource).toContain("onPress={() => selectCluster(clusterId)}");
    expect(mapSource).toContain("onPress={() => void selectUser(userId)}");
    expect(mapSource).toContain("onPress={() => void collectBot(bot)}");
    expect(mapSource).not.toMatch(/onSelected=\{\(\) => (?:void )?(?:selectCluster|selectUser|collectBot)/);
  });

  it("preserves the accessible visible-marker action sheet", () => {
    expect(mapSource).toContain("<MapMarkerActionSheet");
    expect(mapSource).toContain('accessibilityViewIsModal');
    expect(mapSource).toContain('accessibilityLabel="Visible map markers"');
  });
});
