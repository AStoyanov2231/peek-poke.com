import { Platform } from "react-native";
import { render, userEvent } from "@testing-library/react-native";
import { AdminReportActions } from "@/components/admin-report-actions";

jest.mock("@/components/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Button: ({ children, disabled, onPress }: {
    children: string;
    disabled?: boolean;
    onPress: () => void;
    }) => (
      <Pressable
        accessibilityLabel={children}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
      >
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});

describe(`AdminReportActions on ${Platform.OS}`, () => {
  it("routes real Review, Resolve, and Dismiss controls to exact actions", async () => {
    const onAction = jest.fn();
    const result = render(
      <AdminReportActions pending={false} status="pending" onAction={onAction} />,
    );
    const user = userEvent.setup();

    await user.press(result.getByRole("button", { name: "Review" }));
    await user.press(result.getByRole("button", { name: "Resolve" }));
    await user.press(result.getByRole("button", { name: "Dismiss" }));
    expect(onAction.mock.calls.map(([action]) => action))
      .toEqual(["reviewing", "resolved", "dismissed"]);
  });

  it("disables every action while that report owns a pending mutation", () => {
    const result = render(
      <AdminReportActions pending status="reviewing" onAction={jest.fn()} />,
    );

    expect(result.getByLabelText("Report moderation actions").props.accessibilityState.busy)
      .toBe(true);
    expect(result.getAllByRole("button").every(
      (button) => button.props.accessibilityState.disabled === true,
    )).toBe(true);
  });
});
