import { Platform, StyleSheet } from "react-native";
import { render, userEvent } from "@testing-library/react-native";
import { LocationSyncRecovery } from "@/components/location-sync-recovery";

describe(`LocationSyncRecovery on ${Platform.OS}`, () => {
  it("exposes a persistent stale-coordinate alert and a platform-sized real Retry pressable", async () => {
    const retry = jest.fn();
    const result = render(
      <LocationSyncRecovery bottom={24} pending={false} onRetry={retry} />,
    );
    const button = result.getByRole("button", { name: "Retry location sync" });
    const expectedSize = Platform.OS === "ios" ? 44 : 48;

    expect(result.getByTestId("location-sync-recovery").props).toMatchObject({
      accessibilityLiveRegion: "assertive",
      accessibilityRole: "alert",
    });
    expect(result.getByText(/location is stale/)).toBeTruthy();
    expect(result.getByText(/meeting features are paused/)).toBeTruthy();
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({
      minHeight: expectedSize,
      minWidth: expectedSize,
    });
    expect(button.props).toMatchObject({
      accessibilityHint: "Retries location recovery to refresh nearby people",
      accessibilityState: { busy: false, disabled: false },
    });
    expect(button.props.onStartShouldSetResponder()).toBe(true);

    const user = userEvent.setup();
    await user.press(button);
    await user.press(button);
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it("announces pending recovery and rejects duplicate presses", async () => {
    const retry = jest.fn();
    const result = render(
      <LocationSyncRecovery bottom={24} pending onRetry={retry} />,
    );
    const button = result.getByRole("button", {
      name: "Retry location sync",
      disabled: true,
      busy: true,
    });

    expect(result.getByText("Retrying…")).toBeTruthy();
    expect(button.props.onStartShouldSetResponder()).toBe(false);
    await userEvent.setup().press(button);
    expect(retry).not.toHaveBeenCalled();
  });
});
