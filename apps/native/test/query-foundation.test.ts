import { describe, expect, it } from "vitest";
import { nativeQueryClient } from "@/data/query-client";
import {
  isNativeChatQueryKey,
  isNativeUserSyncQueryKey,
  nativeQueryKeys,
} from "@/data/query-keys";
import { ApiTransportError, safeQueryRetryDelay, shouldRetrySafeQuery } from "@peekpoke/shared";

describe("native query foundation", () => {
  it("uses the shared production retry policy", () => {
    const defaults = nativeQueryClient.getDefaultOptions().queries;
    expect(defaults?.retry).toBe(shouldRetrySafeQuery);
    expect(defaults?.retryDelay).toBe(safeQueryRetryDelay);
    expect(shouldRetrySafeQuery(0, new ApiTransportError("Rate limited", 429, "RATE_LIMITED"))).toBe(false);
    expect(shouldRetrySafeQuery(0, new ApiTransportError("Unavailable", 503, "SERVICE_UNAVAILABLE"))).toBe(true);
    expect(nativeQueryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it("uses stable screen-specific query keys", () => {
    expect(nativeQueryKeys.profile.current).toEqual(["profile", "current"]);
    expect(nativeQueryKeys.chat.messages("thread-1")).toEqual(["chat", "thread-1", "messages"]);
    expect(isNativeChatQueryKey(nativeQueryKeys.chat.messages("thread-1"))).toBe(true);
    expect(isNativeChatQueryKey(nativeQueryKeys.inbox.threads)).toBe(false);
    expect(isNativeUserSyncQueryKey(nativeQueryKeys.chat.messages("thread-1"))).toBe(true);
    expect(isNativeUserSyncQueryKey(nativeQueryKeys.social.friends)).toBe(true);
    expect(isNativeUserSyncQueryKey(nativeQueryKeys.inbox.threads)).toBe(true);
    expect(isNativeUserSyncQueryKey(nativeQueryKeys.profile.current)).toBe(false);
  });

  it("deduplicates identical in-flight reads", async () => {
    let calls = 0;
    const queryFn = async () => {
      calls += 1;
      await Promise.resolve();
      return { id: "profile-1" };
    };

    const [first, second] = await Promise.all([
      nativeQueryClient.fetchQuery({ queryKey: ["dedupe"], queryFn, staleTime: 1_000 }),
      nativeQueryClient.fetchQuery({ queryKey: ["dedupe"], queryFn, staleTime: 1_000 }),
    ]);

    expect(first).toEqual(second);
    expect(calls).toBe(1);
    nativeQueryClient.removeQueries({ queryKey: ["dedupe"] });
  });
});
