import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateReadReceiptThread,
  deactivateReadReceiptThread,
  markActiveThreadRead,
  observeReadReceiptAuthOwner,
  subscribeReadReceiptFailures,
} from "@/data/read-receipt";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
const THREAD_ID = "33333333-3333-4333-8333-333333333333";
const THREAD_B = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  observeReadReceiptAuthOwner(ACCOUNT_ID);
  activateReadReceiptThread(ACCOUNT_ID, THREAD_ID);
});

afterEach(() => {
  observeReadReceiptAuthOwner(null);
  vi.unstubAllGlobals();
});

describe("web read receipt transport", () => {
  it("commits only an exact validated 2xx response", async () => {
    const commit = vi.fn();
    vi.stubGlobal("fetch", response({ success: true, last_read_sequence: 7 }));

    await expect(markActiveThreadRead(ACCOUNT_ID, THREAD_ID, commit)).resolves.toEqual({
      success: true,
      last_read_sequence: 7,
    });
    expect(commit).toHaveBeenCalledOnce();
  });

  it.each([
    ["network", () => Promise.reject(new TypeError("offline"))],
    ["500", () => Promise.resolve(new Response(JSON.stringify({
      version: "v1",
      error: "Internal server error",
      message: "Internal server error",
      code: "MESSAGE_READ_FAILED",
      request_id: null,
    }), { status: 500 }))],
    ["malformed 2xx", () => Promise.resolve(new Response(JSON.stringify({ success: true })))],
  ])("does not commit unread state after %s failure", async (_label, fetcher) => {
    const commit = vi.fn();
    const onFailure = vi.fn();
    const stopFailures = subscribeReadReceiptFailures(onFailure);
    vi.stubGlobal("fetch", vi.fn(fetcher));

    await expect(markActiveThreadRead(ACCOUNT_ID, THREAD_ID, commit)).rejects.toBeTruthy();
    expect(commit).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(ACCOUNT_ID, THREAD_ID, expect.anything());
    stopFailures();
  });

  it("coalesces duplicates and fences a late thread/account result before commit", async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    const firstCommit = vi.fn();
    const secondCommit = vi.fn();
    const onFailure = vi.fn();
    const stopFailures = subscribeReadReceiptFailures(onFailure);

    const first = markActiveThreadRead(ACCOUNT_ID, THREAD_ID, firstCommit);
    const duplicate = markActiveThreadRead(ACCOUNT_ID, THREAD_ID, secondCommit);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    activateReadReceiptThread(ACCOUNT_ID, THREAD_B);
    observeReadReceiptAuthOwner(ACCOUNT_B);
    resolve(new Response(JSON.stringify({ success: true, last_read_sequence: 8 })));

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(duplicate).rejects.toMatchObject({ name: "AbortError" });
    expect(firstCommit).not.toHaveBeenCalled();
    expect(secondCommit).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();

    observeReadReceiptAuthOwner(ACCOUNT_ID);
    const current = activateReadReceiptThread(ACCOUNT_ID, THREAD_ID)!;
    vi.stubGlobal("fetch", response({ success: true, last_read_sequence: 9 }));
    await expect(markActiveThreadRead(ACCOUNT_ID, THREAD_ID)).resolves.toMatchObject({
      last_read_sequence: 9,
    });
    deactivateReadReceiptThread(current);
    stopFailures();
  });
});

function response(payload: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(payload)));
}
