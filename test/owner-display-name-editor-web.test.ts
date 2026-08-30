import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { OwnerDisplayNameEditor } from "@/features/profile/components/OwnerDisplayNameEditor";

describe("responsive web owner display-name editor", () => {
  it("uses real input/buttons for Unicode edit, save, cancel, and accessible recovery", () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(OwnerDisplayNameEditor, {
        error: "Network unavailable",
        id: "display-name",
        onCancel,
        onChange,
        onSave,
        saving: false,
        value: "Ada",
      }));
    });

    const input = renderer.root.findByType("input");
    act(() => input.props.onChange({ target: { value: "😀".repeat(51) } }));
    expect(onChange).toHaveBeenCalledWith("😀".repeat(50));
    const buttons = renderer.root.findAllByType("button");
    act(() => buttons[0].props.onClick());
    act(() => buttons[1].props.onClick());
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
    expect(renderer.root.findByProps({ role: "alert" }).children).toEqual(["Network unavailable"]);
  });

  it("disables both actions and shows progress during a pending save", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(OwnerDisplayNameEditor, {
        error: null,
        id: "display-name",
        onCancel: vi.fn(),
        onChange: vi.fn(),
        onSave: vi.fn(),
        saving: true,
        value: "Ada",
      }));
    });

    const buttons = renderer.root.findAllByType("button");
    expect(buttons.map((button) => button.props.disabled)).toEqual([true, true]);
    expect(buttons[1].children).toEqual(["Saving…"]);
  });
});
