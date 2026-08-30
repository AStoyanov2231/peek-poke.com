import { Platform } from "react-native";
import { fireEvent, render, userEvent } from "@testing-library/react-native";
import { OwnerDisplayNameEditor } from "@/components/owner-display-name-editor";

jest.mock("@/components/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Button: ({ children, disabled, loading, onPress }: {
      children: string;
      disabled?: boolean;
      loading?: boolean;
      onPress: () => void;
    }) => (
      <Pressable
        accessibilityLabel={children}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading }}
        disabled={disabled || loading}
        onPress={onPress}
      >
        <Text>{loading ? "Saving…" : children}</Text>
      </Pressable>
    ),
    Caption: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  };
});

describe(`OwnerDisplayNameEditor on ${Platform.OS}`, () => {
  it("uses real native controls for Unicode edit, save, cancel, and accessible error recovery", async () => {
    const onChange = jest.fn();
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const result = render(
      <OwnerDisplayNameEditor
        error="Network unavailable"
        onCancel={onCancel}
        onChange={onChange}
        onSave={onSave}
        saving={false}
        value="Ada"
      />,
    );

    fireEvent.changeText(result.getByLabelText("Display name"), "😀".repeat(51));
    expect(onChange).toHaveBeenCalledWith("😀".repeat(50));
    expect(result.getByText("Network unavailable")).toBeTruthy();
    await userEvent.setup().press(result.getByRole("button", { name: "Save" }));
    await userEvent.setup().press(result.getByRole("button", { name: "Cancel" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables both actions while a save is pending", () => {
    const result = render(
      <OwnerDisplayNameEditor
        error={null}
        onCancel={jest.fn()}
        onChange={jest.fn()}
        onSave={jest.fn()}
        saving
        value="Ada"
      />,
    );

    expect(result.getByRole("button", { name: "Cancel" }).props.accessibilityState.disabled).toBe(true);
    expect(result.getByRole("button", { name: "Save" }).props.accessibilityState.disabled).toBe(true);
  });
});
