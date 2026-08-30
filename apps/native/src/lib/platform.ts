import { Platform } from "react-native";

export type NativePlatform = "ios" | "android";

export function currentNativePlatform(): NativePlatform {
  return Platform.OS === "ios" ? "ios" : "android";
}
