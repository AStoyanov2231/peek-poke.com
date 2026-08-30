import { currentNativePlatform, type NativePlatform } from "@/lib/platform";

export function onboardingKeyboardBehavior(
  platform: NativePlatform = currentNativePlatform()
): "padding" | undefined {
  return platform === "ios" ? "padding" : undefined;
}
