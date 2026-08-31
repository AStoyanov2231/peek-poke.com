import { describe, expect, it } from "vitest";
import {
  clusterMarkerAccessibility,
  coinMarkerAccessibility,
  userMarkerAccessibility,
} from "@/lib/map-marker-accessibility";

describe("map marker accessibility actions", () => {
  it("announces cluster size, current zoom, and selected state", () => {
    expect(clusterMarkerAccessibility(3, 17.4, true)).toEqual({
      label: "3 people nearby",
      hint: "Show this cluster at map zoom 17",
      state: { selected: true },
    });
    expect(clusterMarkerAccessibility(1, 18.6, false).label).toBe("1 person nearby");
  });

  it("announces user selection and loading state", () => {
    expect(userMarkerAccessibility("Alex", true, true)).toEqual({
      label: "Alex",
      hint: "Select this person on the map",
      state: { busy: true, selected: true },
    });
  });

  it("only enables coin collection while the coin is in range", () => {
    expect(coinMarkerAccessibility(true).state).toEqual({ disabled: false });
    expect(coinMarkerAccessibility(false)).toEqual({
      label: "Coin, get closer",
      hint: "Move closer before collecting this coin",
      state: { disabled: true },
    });
  });
});
