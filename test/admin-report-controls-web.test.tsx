import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { AdminReportMutationControls } from "@/features/admin/components/AdminReportMutationControls";

describe("web admin report controls", () => {
  it("uses real action buttons and exposes pending ownership", () => {
    const onAction = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <AdminReportMutationControls
          attempt={null}
          reportId="report-1"
          status="pending"
          onAction={onAction}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
        />,
      );
    });

    const buttons = renderer.root.findAllByType("button");
    expect(buttons.map((button) => button.children.join("")))
      .toEqual(["Start review", "Resolve", "Dismiss"]);
    act(() => buttons[1].props.onClick());
    expect(onAction).toHaveBeenCalledWith("resolved");

    act(() => {
      renderer.update(
        <AdminReportMutationControls
          attempt={{ action: "resolved", message: null, phase: "pending" }}
          reportId="report-1"
          status="pending"
          onAction={onAction}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
        />,
      );
    });
    expect(renderer.root.findAllByType("button").every((button) => button.props.disabled)).toBe(true);
    expect(renderer.root.findByProps({ role: "status" }).children.join(""))
      .toBe("Resolve pending…");
  });

  it("renders an inline accessible error with working Retry and Cancel controls", () => {
    const retry = vi.fn();
    const cancel = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <AdminReportMutationControls
          attempt={{
            action: "dismissed",
            message: "Network unavailable. The report remains in this queue.",
            phase: "failed",
          }}
          reportId="report-1"
          status="pending"
          onAction={vi.fn()}
          onCancel={cancel}
          onRetry={retry}
        />,
      );
    });

    expect(renderer.root.findByProps({ role: "alert" }).children.join(""))
      .toContain("remains in this queue");
    const buttons = renderer.root.findAllByType("button");
    expect(buttons[0].props["aria-label"]).toBe("Retry dismiss for report");
    expect(buttons[1].props["aria-label"]).toBe("Cancel report update retry");
    act(() => buttons[0].props.onClick());
    act(() => buttons[1].props.onClick());
    expect(retry).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
