import { createElement, useLayoutEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInboxPriorityTab } from "@/hooks/use-inbox-priority-tab";

type Props = Parameters<typeof useInboxPriorityTab>[0];
const visible: { current: ReturnType<typeof useInboxPriorityTab> | null } = { current: null };
let renderer: ReactTestRenderer | null = null;

function Harness(props: Props) {
  const priority = useInboxPriorityTab(props);
  useLayoutEffect(() => { visible.current = priority; });
  return null;
}

describe("native Inbox priority lifecycle", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    visible.current = null;
  });

  afterEach(async () => {
    await act(async () => { renderer?.unmount(); });
    renderer = null;
    vi.unstubAllGlobals();
  });

  it("does not freeze Chats after an error and prioritizes recovered Pokes", async () => {
    const pending: Props = {
      accountId: "account-a",
      identityState: "success",
      explicitTab: null,
      pendingReceivedPokeCount: 0,
      actionablePlanCount: 0,
      pokesState: "pending",
      plansState: "pending",
    };
    await act(async () => { renderer = create(createElement(Harness, pending)); });
    expect(visible.current).toMatchObject({ tab: null, waitingForPriority: true, priorityError: false });

    await act(async () => {
      renderer?.update(createElement(Harness, { ...pending, pokesState: "error", plansState: "success" }));
    });
    expect(visible.current).toMatchObject({ tab: null, waitingForPriority: false, priorityError: true });

    await act(async () => {
      renderer?.update(createElement(Harness, {
        ...pending,
        pendingReceivedPokeCount: 1,
        pokesState: "success",
        plansState: "success",
      }));
    });
    expect(visible.current).toMatchObject({ tab: "pokes", waitingForPriority: false, priorityError: false });
  });

  it("waits for the new account's data instead of reusing the former account's tab", async () => {
    const readyForA: Props = {
      accountId: "account-a",
      identityState: "success",
      explicitTab: null,
      pendingReceivedPokeCount: 1,
      actionablePlanCount: 0,
      pokesState: "success",
      plansState: "success",
    };
    await act(async () => { renderer = create(createElement(Harness, readyForA)); });
    expect(visible.current?.tab).toBe("pokes");

    await act(async () => {
      renderer?.update(createElement(Harness, {
        ...readyForA,
        accountId: "account-b",
        pendingReceivedPokeCount: 0,
        pokesState: "pending",
        plansState: "pending",
      }));
    });
    expect(visible.current).toMatchObject({ tab: null, waitingForPriority: true });

    await act(async () => {
      renderer?.update(createElement(Harness, {
        ...readyForA,
        accountId: "account-b",
        identityState: "error",
      }));
    });
    expect(visible.current).toMatchObject({ tab: null, waitingForPriority: false, priorityError: true });

    await act(async () => {
      renderer?.update(createElement(Harness, {
        ...readyForA,
        accountId: "account-b",
        pendingReceivedPokeCount: 0,
        actionablePlanCount: 1,
      }));
    });
    expect(visible.current?.tab).toBe("plans");
  });

  it("keeps the loaded tab visible when a background priority refetch fails", async () => {
    const ready: Props = {
      accountId: "account-a",
      identityState: "success",
      explicitTab: null,
      pendingReceivedPokeCount: 1,
      actionablePlanCount: 0,
      pokesState: "success",
      plansState: "success",
    };
    await act(async () => { renderer = create(createElement(Harness, ready)); });
    expect(visible.current).toMatchObject({ tab: "pokes", waitingForPriority: false, priorityError: false });

    await act(async () => {
      renderer?.update(createElement(Harness, { ...ready, pokesState: "error" }));
    });
    expect(visible.current).toMatchObject({ tab: "pokes", waitingForPriority: false, priorityError: false });

    await act(async () => {
      renderer?.update(createElement(Harness, {
        ...ready,
        identityState: "error",
      }));
    });
    expect(visible.current).toMatchObject({ tab: "pokes", waitingForPriority: false, priorityError: false });
  });

  it("shows retry recovery when identity fails before an automatic choice", async () => {
    const initialIdentityFailure: Props = {
      accountId: undefined,
      identityState: "error",
      explicitTab: null,
      pendingReceivedPokeCount: 0,
      actionablePlanCount: 0,
      pokesState: "pending",
      plansState: "pending",
    };
    await act(async () => { renderer = create(createElement(Harness, initialIdentityFailure)); });
    expect(visible.current).toMatchObject({ tab: null, waitingForPriority: false, priorityError: true });
  });
});
