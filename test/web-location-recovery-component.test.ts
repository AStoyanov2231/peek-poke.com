import { Children, isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { LocationRecoveryAlert } from "@/features/map/components/LocationRecoveryAlert";

describe("web location recovery alert", () => {
  it("exposes a persistent accessible Retry action for retained stale coordinates", () => {
    const retry = vi.fn();
    const alert = LocationRecoveryAlert({ open: true, pending: false, onRetry: retry });
    expect(isValidElement(alert)).toBe(true);
    expect(alert?.props).toMatchObject({ role: "alert", "aria-live": "assertive" });

    const children = Children.toArray(alert?.props.children) as ReactElement[];
    const message = children[0];
    const button = children[1];
    expect(message.props.children).toMatch(/location is stale/i);
    expect(message.props.children).toMatch(/meeting features are paused/i);
    expect(button.props).toMatchObject({
      "aria-busy": false,
      "aria-label": "Retry location recovery",
      disabled: false,
      type: "button",
    });
    expect(button.props.className).toContain("min-h-11");
    button.props.onClick();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("keeps the alert visible and disables duplicate retries while recovery is pending", () => {
    const retry = vi.fn();
    const alert = LocationRecoveryAlert({ open: true, pending: true, onRetry: retry });
    const children = Children.toArray(alert?.props.children) as ReactElement[];
    const button = children[1];

    expect(button.props).toMatchObject({ "aria-busy": true, disabled: true });
    expect(button.props.children).toBe("Retrying…");
  });
});
