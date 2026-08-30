import { describe, expect, it } from "vitest";
import {
  iconButtonGeometry,
  mapTouchTargetGeometry,
  minimumTouchTarget,
  segmentAccessibility,
  segmentedControlGeometry,
} from "@/components/ui-touch-targets";

describe("native shared-control touch targets", () => {
  it("uses the platform accessibility minimum on iOS and Android", () => {
    expect(minimumTouchTarget("ios")).toBe(44);
    expect(minimumTouchTarget("android")).toBe(48);
  });

  it("uses non-overlapping layout geometry while preserving the requested visual size", () => {
    expect(iconButtonGeometry(36, "ios")).toEqual({ activationSize: 44, visualSize: 36 });
    expect(iconButtonGeometry(36, "android")).toEqual({ activationSize: 48, visualSize: 36 });
    expect(iconButtonGeometry(44, "ios")).toEqual({ activationSize: 44, visualSize: 44 });
    expect(iconButtonGeometry(44, "android")).toEqual({ activationSize: 48, visualSize: 44 });
    expect(iconButtonGeometry(56, "ios")).toEqual({ activationSize: 56, visualSize: 56 });
    expect(iconButtonGeometry(56, "android")).toEqual({ activationSize: 56, visualSize: 56 });
  });

  it("clamps invalid visual sizes without shrinking the platform activation area", () => {
    expect(iconButtonGeometry(0, "ios")).toEqual({ activationSize: 44, visualSize: 1 });
    expect(iconButtonGeometry(-8, "android")).toEqual({ activationSize: 48, visualSize: 1 });
  });

  it("gives segments full-size geometry without overlapping hit slop", () => {
    expect(segmentedControlGeometry("ios")).toEqual({
      containerMinHeight: 44,
      segmentMinHeight: 44,
      hitSlop: undefined,
    });
    expect(segmentedControlGeometry("android")).toEqual({
      containerMinHeight: 48,
      segmentMinHeight: 48,
      hitSlop: undefined,
    });
  });

  it("keeps map pin and compact-control visuals inside platform-sized activation bounds", () => {
    expect(mapTouchTargetGeometry("ios")).toEqual({
      activationSize: 44,
      pinVisualSize: 40,
      compactControlVisualHeight: 32,
    });
    expect(mapTouchTargetGeometry("android")).toEqual({
      activationSize: 48,
      pinVisualSize: 40,
      compactControlVisualHeight: 32,
    });
  });

  it("preserves segment labels, roles, and selected state", () => {
    expect(segmentAccessibility("Messages", undefined, true)).toEqual({
      label: "Messages",
      role: "button",
      state: { selected: true },
    });
    expect(segmentAccessibility("Requests", 12, false)).toEqual({
      label: "Requests, 9 or more",
      role: "button",
      state: { selected: false },
    });
  });
});
