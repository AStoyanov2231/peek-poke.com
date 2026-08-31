import { Platform, StyleSheet } from "react-native";
import { render, userEvent } from "@testing-library/react-native";
import { MapFilterMenu } from "@/components/map-filter-menu";

describe(`MapFilterMenu on ${Platform.OS}`, () => {
  it("uses platform-sized selected controls and closes after a selection", async () => {
    const onChange = jest.fn();
    const onOpenChange = jest.fn();
    const result = render(
      <MapFilterMenu filter="all" open onChange={onChange} onOpenChange={onOpenChange} />,
    );
    const online = result.getByRole("button", { name: "Online", selected: false });

    expect(StyleSheet.flatten(online.props.style)).toMatchObject({
      minHeight: Platform.OS === "ios" ? 44 : 48,
    });
    await userEvent.setup().press(online);

    expect(onChange).toHaveBeenCalledWith("online");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("exposes the selected option", () => {
    const result = render(
      <MapFilterMenu filter="friends" open onChange={jest.fn()} onOpenChange={jest.fn()} />,
    );

    expect(result.getByRole("button", { name: "Friends", selected: true })).toBeTruthy();
  });
});
