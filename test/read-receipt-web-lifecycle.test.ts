import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const THREAD_A = "33333333-3333-4333-8333-333333333333";
const THREAD_B = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  deactivate: vi.fn(),
  failureListeners: new Set<(
    accountId: string,
    threadId: string,
    failure: unknown,
  ) => void>(),
  mark: vi.fn(),
  online: true,
  onlineListeners: new Set<(online: boolean) => void>(),
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    onlineManager: {
      isOnline: () => mocks.online,
      subscribe: (listener: (online: boolean) => void) => {
        mocks.onlineListeners.add(listener);
        return () => mocks.onlineListeners.delete(listener);
      },
    },
    useQueryClient: () => mocks.queryClient,
  };
});

vi.mock("@/data/read-receipt", () => ({
  activateReadReceiptThread: mocks.activate,
  deactivateReadReceiptThread: mocks.deactivate,
  markActiveThreadRead: mocks.mark,
  subscribeReadReceiptFailures: (listener: (
    accountId: string,
    threadId: string,
    failure: unknown,
  ) => void) => {
    mocks.failureListeners.add(listener);
    return () => mocks.failureListeners.delete(listener);
  },
}));

import { useReadReceipt } from "@/features/chat/useReadReceipt";
import { webQueryKeys } from "@/data/web-query";

let renderer: ReactTestRenderer | null = null;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function Harness({ accountId, threadId }: { accountId?: string; threadId: string }) {
  const receipt = useReadReceipt(accountId, threadId);
  return createElement("read-receipt-state", receipt);
}

function state() {
  if (!renderer) throw new Error("Harness is not mounted");
  return renderer.root.findByType("read-receipt-state").props as {
    error: string | null;
    isPending: boolean;
    retry: () => void;
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  mocks.online = true;
  mocks.failureListeners.clear();
  mocks.onlineListeners.clear();
  mocks.failureListeners.clear();
  let generation = 0;
  mocks.activate.mockImplementation((accountId: string, threadId: string) => ({
    accountId,
    threadId,
    generation: generation++,
  }));
  mocks.queryClient.invalidateQueries.mockResolvedValue(undefined);
});

afterEach(async () => {
  if (renderer) await act(async () => renderer?.unmount());
  renderer = null;
  mocks.onlineListeners.clear();
  vi.unstubAllGlobals();
});

describe("web read-receipt lifecycle", () => {
  it("recovers on online events but bounds automatic retries", async () => {
    mocks.mark.mockRejectedValue(new Error("offline"));
    await act(async () => {
      renderer = create(createElement(Harness, { accountId: ACCOUNT, threadId: THREAD_A }));
    });
    await flush();
    expect(state()).toMatchObject({ error: "offline", isPending: false });

    for (let index = 0; index < 4; index += 1) {
      await act(async () => {
        for (const listener of mocks.onlineListeners) listener(true);
      });
      await flush();
    }

    expect(mocks.mark).toHaveBeenCalledTimes(3);
    expect(state()).toMatchObject({ error: "offline", isPending: false });
  });

  it("clears recovery only after an exact transport success and inbox invalidation", async () => {
    mocks.mark
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ success: true, last_read_sequence: 5 });
    await act(async () => {
      renderer = create(createElement(Harness, { accountId: ACCOUNT, threadId: THREAD_A }));
    });
    await flush();

    await act(async () => {
      for (const listener of mocks.onlineListeners) listener(true);
    });
    await flush();

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: webQueryKeys.threads,
      exact: true,
    });
    expect(state()).toMatchObject({ error: null, isPending: false });
  });

  it("starts the new thread while a fenced old attempt settles late", async () => {
    const old = deferred<{ success: true; last_read_sequence: number }>();
    mocks.mark
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ success: true, last_read_sequence: 9 });
    await act(async () => {
      renderer = create(createElement(Harness, { accountId: ACCOUNT, threadId: THREAD_A }));
    });
    await flush();

    await act(async () => {
      renderer?.update(createElement(Harness, { accountId: ACCOUNT, threadId: THREAD_B }));
    });
    await flush();
    old.reject(Object.assign(new Error("stale"), { name: "AbortError" }));
    await flush();

    expect(mocks.mark.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      [ACCOUNT, THREAD_A],
      [ACCOUNT, THREAD_B],
    ]);
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledOnce();
    expect(state()).toMatchObject({ error: null, isPending: false });
  });

  it("surfaces a realtime caller failure through the same visible recovery lifecycle", async () => {
    mocks.mark.mockResolvedValue({ success: true, last_read_sequence: 9 });
    await act(async () => {
      renderer = create(createElement(Harness, { accountId: ACCOUNT, threadId: THREAD_A }));
    });
    await flush();

    await act(async () => {
      for (const listener of mocks.failureListeners) {
        listener(ACCOUNT, THREAD_A, new Error("realtime response lost"));
      }
    });
    expect(state()).toMatchObject({ error: "realtime response lost", isPending: false });

    await act(async () => {
      for (const listener of mocks.onlineListeners) listener(true);
    });
    await flush();
    expect(mocks.mark).toHaveBeenCalledTimes(2);
    expect(state()).toMatchObject({ error: null, isPending: false });
  });
});
