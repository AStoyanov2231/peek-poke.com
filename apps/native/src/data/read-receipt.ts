import {
  createReadReceiptCoordinator,
  readReceiptResponseSchema,
  StaleReadReceiptError,
  type ReadReceiptOwnerToken,
  type ReadReceiptResponse,
} from "@peekpoke/shared";
import { apiFetch } from "@/lib/api";

const readReceipts = createReadReceiptCoordinator();
const failureListeners = new Set<(
  accountId: string,
  threadId: string,
  failure: unknown,
) => void>();

export function observeReadReceiptAuthOwner(accountId: string | null) {
  readReceipts.observeAccount(accountId);
}

export function activateReadReceiptThread(accountId: string, threadId: string) {
  return readReceipts.activateThread(accountId, threadId);
}

export function deactivateReadReceiptThread(token: ReadReceiptOwnerToken) {
  return readReceipts.deactivateThread(token);
}

export function subscribeReadReceiptFailures(
  listener: (accountId: string, threadId: string, failure: unknown) => void,
) {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

export function markActiveThreadRead(
  accountId: string,
  threadId: string,
  commit?: (response: ReadReceiptResponse) => void,
) {
  const token = readReceipts.current(accountId, threadId);
  if (!token) return Promise.reject(new StaleReadReceiptError());
  return readReceipts.run(token, (signal) => apiFetch<ReadReceiptResponse>(
    `/api/dm/${encodeURIComponent(threadId)}/read`,
    { method: "POST", signal, responseSchema: readReceiptResponseSchema },
  )).then((response) => {
    if (!readReceipts.isCurrent(token)) throw new StaleReadReceiptError();
    commit?.(response);
    return response;
  }).catch((failure: unknown) => {
    if (
      readReceipts.isCurrent(token)
      && (!(failure instanceof Error) || failure.name !== "AbortError")
    ) {
      failureListeners.forEach((listener) => listener(accountId, threadId, failure));
    }
    throw failure;
  });
}
