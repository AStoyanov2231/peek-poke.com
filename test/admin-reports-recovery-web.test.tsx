import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiTransportError, contractFixtureReport } from "@peekpoke/shared";

const OWNER_A = "10000000-0000-4000-8000-000000000001";
const OWNER_B = "10000000-0000-4000-8000-000000000002";
const REPORT_TWO = "20000000-0000-4000-8000-000000000002";

const harness = vi.hoisted(() => ({
  accountId: "10000000-0000-4000-8000-000000000001",
  invalidate: vi.fn(async () => undefined),
  update: vi.fn(),
}));

vi.mock("@/data/web-query", () => ({
  bootstrapQueryOptions: { queryKey: ["bootstrap"] },
}));
vi.mock("@/data/admin-query", async () => {
  const actual = await vi.importActual<typeof import("@/data/admin-query")>("@/data/admin-query");
  return { ...actual, updateAdminReport: harness.update };
});
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: harness.invalidate }),
  useQuery: (options: { queryKey: unknown[] }) => {
    if (options.queryKey[0] === "bootstrap") {
      return { data: { identity: { id: harness.accountId } } };
    }
    return {
      data: {
        reports: [
          contractFixtureReport,
          { ...contractFixtureReport, id: REPORT_TWO, category: "harassment" },
        ],
      },
      isError: false,
      isLoading: false,
    };
  },
}));

import { AdminReportsTab } from "@/features/admin/components/tabs/AdminReportsTab";

describe("web admin report mutation recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.accountId = OWNER_A;
  });

  it("gives each report pending ownership and invalidates only after validated success", async () => {
    const pending = deferred<{ report: typeof contractFixtureReport }>();
    harness.update.mockReturnValueOnce(pending.promise);
    const renderer = renderTab();

    act(() => findButtons(renderer, "Resolve")[0].props.onClick());

    const resolveButtons = findButtons(renderer, "Resolve");
    expect(resolveButtons[0].props.disabled).toBe(true);
    expect(resolveButtons[1].props.disabled).toBe(false);
    expect(renderer.root.findByProps({ role: "status" }).children.join(""))
      .toBe("Resolve pending…");
    expect(harness.invalidate).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({ report: { ...contractFixtureReport, status: "resolved" } });
      await pending.promise;
      await Promise.resolve();
    });

    expect(harness.invalidate).toHaveBeenCalledWith({
      exact: true,
      queryKey: ["admin-reports", OWNER_A, "pending"],
    });
  });

  it.each([
    new ApiTransportError("network", 0, "NETWORK_UNAVAILABLE"),
    new ApiTransportError("forbidden", 403, "FORBIDDEN"),
    new ApiTransportError("server", 503, "MODERATION_REVIEW_FAILED"),
    new ApiTransportError("invalid", 502, "INVALID_RESPONSE"),
  ])("keeps the queue and exposes retry/cancel without invalidation for %#", async (error) => {
    harness.update.mockRejectedValueOnce(error);
    const renderer = renderTab();

    await act(async () => {
      findButtons(renderer, "Dismiss")[0].props.onClick();
      await Promise.resolve();
    });

    expect(renderer.root.findAllByType("article")).toHaveLength(2);
    expect(renderer.root.findByProps({ role: "alert" }).children.join(""))
      .toContain("remains in this queue");
    expect(findButtons(renderer, "Retry")).toHaveLength(1);
    expect(findButtons(renderer, "Cancel")).toHaveLength(1);
    expect(harness.invalidate).not.toHaveBeenCalled();
  });

  it("fences a successful stale response after the status tab changes", async () => {
    const pending = deferred<{ report: typeof contractFixtureReport }>();
    harness.update.mockReturnValueOnce(pending.promise);
    const renderer = renderTab();

    act(() => findButtons(renderer, "Resolve")[0].props.onClick());
    act(() => findButtons(renderer, "reviewing")[0].props.onClick());
    await act(async () => {
      pending.resolve({ report: { ...contractFixtureReport, status: "resolved" } });
      await pending.promise;
      await Promise.resolve();
    });

    expect(harness.invalidate).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ role: "alert" })).toHaveLength(0);
  });

  it("fences a successful stale response after the authenticated account changes", async () => {
    const pending = deferred<{ report: typeof contractFixtureReport }>();
    harness.update.mockReturnValueOnce(pending.promise);
    const renderer = renderTab();

    act(() => findButtons(renderer, "Resolve")[0].props.onClick());
    harness.accountId = OWNER_B;
    act(() => renderer.update(<AdminReportsTab />));
    await act(async () => {
      pending.resolve({ report: { ...contractFixtureReport, status: "resolved" } });
      await pending.promise;
      await Promise.resolve();
    });

    expect(harness.invalidate).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(0);
  });
});

function renderTab() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<AdminReportsTab />);
  });
  return renderer;
}

function findButtons(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.findAllByType("button").filter(
    (button) => button.children.join("") === label,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
