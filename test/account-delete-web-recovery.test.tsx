import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/stores/callStore", () => ({
  useCallStore: { getState: () => ({ observeAccount: vi.fn() }) },
}));

import { SettingsSheet } from "@/features/profile/components/SettingsSheet";

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
}

function button(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.findAllByType("button").find((candidate) => text(candidate).includes(label));
}

describe("web account deletion recovery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the destructive confirmation open with retry controls after migration-unavailable failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      version: "v1",
      error: "Account deletion is temporarily unavailable. Please try again.",
      message: "Account deletion is temporarily unavailable. Please try again.",
      code: "ACCOUNT_DELETE_UNAVAILABLE",
      request_id: "account-delete-web-recovery",
    }), { status: 503, headers: { "content-type": "application/json" } })));
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsSheet open onOpenChange={vi.fn()} />);
    });

    act(() => button(renderer, "Delete Account")?.props.onClick());
    await act(async () => {
      button(renderer, "Delete My Account")?.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ role: "alert" }).children.join(""))
      .toContain("We couldn't delete your account");
    expect(button(renderer, "Delete My Account")?.props.disabled).toBe(false);
    expect(button(renderer, "Keep My Account")?.props.disabled).toBe(false);
  });
});
