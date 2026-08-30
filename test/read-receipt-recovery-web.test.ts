import { Children, isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ReadReceiptRecovery } from "@/features/chat/components/ReadReceiptRecovery";

describe("web read-receipt recovery", () => {
  it("renders a persistent accessible retry with a 44px minimum target", () => {
    const retry = vi.fn();
    const alert = ReadReceiptRecovery({ pending: false, onRetry: retry });
    expect(isValidElement(alert)).toBe(true);
    expect(alert.props).toMatchObject({ role: "alert", "aria-live": "assertive" });

    const children = Children.toArray(alert.props.children) as ReactElement[];
    expect(children[0].props.children).toMatch(/unread status could not sync/i);
    expect(children[1].props).toMatchObject({
      "aria-busy": false,
      "aria-label": "Retry unread status sync",
      disabled: false,
      type: "button",
    });
    expect(children[1].props.className).toContain("min-h-11");
    children[1].props.onClick();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("blocks duplicate retry interaction while pending", () => {
    const alert = ReadReceiptRecovery({ pending: true, onRetry: vi.fn() });
    const children = Children.toArray(alert.props.children) as ReactElement[];
    expect(children[1].props).toMatchObject({ "aria-busy": true, disabled: true });
    expect(children[1].props.children).toBe("Retrying…");
  });
});
