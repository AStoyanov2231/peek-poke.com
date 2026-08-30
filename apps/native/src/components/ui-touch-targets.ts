export type NativeTouchPlatform = "ios" | "android";

export function minimumTouchTarget(platform: NativeTouchPlatform): number {
  return platform === "android" ? 48 : 44;
}

export function iconButtonGeometry(size: number, platform: NativeTouchPlatform) {
  const visualSize = Math.max(1, size);
  return {
    activationSize: Math.max(visualSize, minimumTouchTarget(platform)),
    visualSize,
  } as const;
}

export function segmentedControlGeometry(platform: NativeTouchPlatform) {
  const minHeight = minimumTouchTarget(platform);
  return {
    containerMinHeight: minHeight,
    segmentMinHeight: minHeight,
    hitSlop: undefined,
  } as const;
}

export function mapTouchTargetGeometry(platform: NativeTouchPlatform) {
  return {
    activationSize: minimumTouchTarget(platform),
    pinVisualSize: 40,
    compactControlVisualHeight: 32,
  } as const;
}

export function segmentAccessibility(label: string, badge: number | undefined, selected: boolean) {
  return {
    label: badge ? `${label}, ${badge > 9 ? "9 or more" : badge}` : label,
    role: "button" as const,
    state: { selected },
  };
}
