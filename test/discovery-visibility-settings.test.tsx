// @vitest-environment jsdom

import { act } from "react";
import TestRenderer from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import {
  DiscoveryVisibilitySettings,
  type DiscoveryAudience,
} from "@/features/profile/components/DiscoveryVisibilitySettings";

function radio(renderer: TestRenderer.ReactTestRenderer, audience: DiscoveryAudience) {
  return renderer.root.findAllByType("input").find((input) => input.props.value === audience)!;
}

function render(audience: DiscoveryAudience) {
  return <DiscoveryVisibilitySettings audience={audience} onSave={vi.fn().mockResolvedValue(undefined)} />;
}

describe("DiscoveryVisibilitySettings", () => {
  it("adopts a refetched preference only while the draft is clean", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(render("everyone"));
    });

    act(() => {
      renderer.update(render("hidden"));
    });
    expect(radio(renderer, "hidden").props.checked).toBe(true);

    act(() => {
      radio(renderer, "friends").props.onChange();
    });
    act(() => {
      renderer.update(render("circles"));
    });
    expect(radio(renderer, "friends").props.checked).toBe(true);
  });
});
