import Mapbox from "@rnmapbox/maps";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, type PressableProps } from "react-native";
import { mapTouchTargetGeometry, type NativeTouchPlatform } from "@/components/ui-touch-targets";

const markerGeometry = mapTouchTargetGeometry(Platform.OS as NativeTouchPlatform);

type MapMarkerButtonProps = Pick<
  PressableProps,
  | "accessibilityHint"
  | "accessibilityLabel"
  | "accessibilityState"
  | "disabled"
  | "onPress"
  | "style"
> & {
  children: ReactNode;
  coordinate: [number, number];
};

/** Interactive map content belongs in MarkerView; PointAnnotation taps are selection toggles. */
export function MapMarkerButton({ children, coordinate, ...pressableProps }: MapMarkerButtonProps) {
  const markerStyle = pressableProps.style;
  const style: PressableProps["style"] = typeof markerStyle === "function"
    ? (state) => [styles.activationTarget, markerStyle(state)]
    : [styles.activationTarget, markerStyle];

  return (
    <Mapbox.MarkerView allowOverlap coordinate={coordinate}>
      <Pressable accessibilityRole="button" {...pressableProps} style={style}>
        {children}
      </Pressable>
    </Mapbox.MarkerView>
  );
}

const styles = StyleSheet.create({
  activationTarget: {
    width: markerGeometry.activationSize,
    height: markerGeometry.activationSize,
    alignItems: "center",
    justifyContent: "center",
  },
});
