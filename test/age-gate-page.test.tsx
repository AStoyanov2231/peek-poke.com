import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  fetchContract: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children) }));
vi.mock("@/features/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/typed-api", () => ({ fetchContract: mocks.fetchContract }));

import AgeGatePage from "@/features/auth/components/AgeGatePage";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("web age gate", () => {
  it("requires a visible final review before sending the self-declared DOB", async () => {
    mocks.fetchContract.mockResolvedValue({ status: "pending", decided_at: null });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", { location: { search: "?redirectTo=%2Fnow" } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(QueryClientProvider, { client }, createElement(AgeGatePage)));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const inputs = renderer!.root.findAllByType("input");
    await act(async () => {
      inputs[0].props.onChange({ target: { value: "4" } });
      inputs[1].props.onChange({ target: { value: "3" } });
      inputs[2].props.onChange({ target: { value: "2000" } });
    });
    const form = renderer!.root.findAllByType("form").find((item) => typeof item.props.onSubmit === "function");
    if (!form) throw new Error("Date form was not rendered");
    await act(async () => { form.props.onSubmit({ preventDefault() {} }); });

    const textNodes = renderer!.root.findAllByType("p").map((item) => item.children.join(""));
    expect(textNodes).toContain("4 March 2000");
    expect(textNodes.some((value) => value.includes("self-declaration is final"))).toBe(true);
    expect(mocks.fetchContract).toHaveBeenCalledTimes(1);
    await act(async () => { renderer!.unmount(); });
  });
});
