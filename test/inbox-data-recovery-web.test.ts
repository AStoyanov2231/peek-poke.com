import { Children, isValidElement, type ReactElement } from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { InboxDataRecovery } from "@/features/inbox/components/InboxDataRecovery";

describe("web inbox stale-data recovery", () => {
  it("keeps stale unread state visibly qualified and exposes a 44px retry", () => {
    const retry = vi.fn();
    const alert = InboxDataRecovery({ pending: false, onRetry: retry });
    expect(isValidElement(alert)).toBe(true);
    expect(alert.props).toMatchObject({ role: "alert", "aria-live": "assertive" });
    const children = Children.toArray(alert.props.children) as ReactElement[];
    expect(children[0].props.children).toMatch(/previous inbox/i);
    expect(children[0].props.children).toMatch(/unread status may be outdated/i);
    expect(children[1].props).toMatchObject({
      "aria-busy": false,
      "aria-label": "Retry inbox sync",
      disabled: false,
      type: "button",
    });
    expect(children[1].props.className).toContain("min-h-11");
    children[1].props.onClick();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("disables duplicate retry presses and is mounted for stale inbox query errors", () => {
    const alert = InboxDataRecovery({ pending: true, onRetry: vi.fn() });
    const children = Children.toArray(alert.props.children) as ReactElement[];
    expect(children[1].props).toMatchObject({ "aria-busy": true, disabled: true });
    expect(children[1].props.children).toBe("Retrying…");

    const inboxClient = readFileSync(
      new URL("../src/features/inbox/components/InboxClient.tsx", import.meta.url),
      "utf8",
    );
    expect(inboxClient).toContain('threadsQuery.isError && !threadsQuery.data');
    expect(inboxClient).toContain('threadsQuery.error && threadsQuery.data');
    expect(inboxClient).toContain("<InboxDataRecovery");
  });
});
