import { Platform, StyleSheet } from "react-native";
import { render, userEvent } from "@testing-library/react-native";
import { MapMarkerButton } from "@/components/map-marker-button";

jest.mock("@rnmapbox/maps", () => ({
  __esModule: true,
  default: {
    MarkerView: ({ children, ...props }: { children: import("react").ReactNode }) => {
      const React = require("react");
      const { View } = require("react-native");
      return React.createElement(View, { ...props, testID: "marker-view" }, children);
    },
  },
}));

function renderMarker(label: string, onPress: () => void, disabled = false) {
  const accessibilityState = { busy: true, disabled };
  const result = render(
    <MapMarkerButton
      accessibilityHint="Open this profile"
      accessibilityLabel={label}
      accessibilityState={accessibilityState}
      coordinate={[23.3, 42.7]}
      disabled={disabled}
      onPress={onPress}
    >
      {label}
    </MapMarkerButton>,
  );

  return {
    ...result,
    accessibilityState,
    button: result.getByRole("button", { name: label }),
  };
}

describe(`MapMarkerButton on ${Platform.OS}`, () => {
  it("renders MarkerView geometry and the real Pressable responder", () => {
    const marker = renderMarker("marker", jest.fn());
    const expectedSize = Platform.OS === "ios" ? 44 : 48;

    expect(marker.getByTestId("marker-view").props).toMatchObject({
      allowOverlap: true,
      coordinate: [23.3, 42.7],
    });
    expect(StyleSheet.flatten(marker.button.props.style)).toMatchObject({
      height: expectedSize,
      width: expectedSize,
    });
    expect(marker.button.props).toMatchObject({
      accessibilityHint: "Open this profile",
      accessibilityLabel: "marker",
      accessibilityRole: "button",
      accessibilityState: marker.accessibilityState,
    });
    expect(marker.button.props.onStartShouldSetResponder()).toBe(true);
  });

  it("dispatches every completed Pressability responder cycle", async () => {
    const action = jest.fn();
    const marker = renderMarker("marker", action);
    const user = userEvent.setup();

    for (let tap = 0; tap < 3; tap += 1) {
      await user.press(marker.button);
    }

    expect(action).toHaveBeenCalledTimes(3);
  });

  it("lets real Pressability reject disabled markers", async () => {
    const action = jest.fn();
    const marker = renderMarker("pending marker", action, true);

    expect(marker.getByRole("button", { name: "pending marker", disabled: true })).toBe(marker.button);
    expect(marker.button.props.onStartShouldSetResponder()).toBe(false);
    await userEvent.setup().press(marker.button);

    expect(action).not.toHaveBeenCalled();
  });
});
