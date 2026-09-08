import { describe, expect, it } from "vitest";
import { conciseDiscoveryReasonLabels } from "@/lib/discovery-reasons";

describe("native discovery context labels", () => {
  it("keeps useful server-ordered labels and omits facts already shown on the card", () => {
    expect(conciseDiscoveryReasonLabels([
      "intent_match",
      "mutual_meetup",
      "connected_before",
      "mutual_friends",
    ])).toEqual(["You both marked a meetup", "Connected before"]);
  });

  it("accepts context-free responses during a staged deployment", () => {
    expect(conciseDiscoveryReasonLabels(undefined)).toEqual([]);
  });
});
