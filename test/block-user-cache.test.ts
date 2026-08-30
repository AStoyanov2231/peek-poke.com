import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { commitBlockedUserCache } from "@/data/block-cache";
import { webQueryKeys } from "@/data/web-query";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";
const FRIENDSHIP_ID = "44444444-4444-4444-8444-444444444444";
const TARGET_THREAD_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_THREAD_ID = "66666666-6666-4666-8666-666666666666";

describe("web blocked-user cache commit", () => {
  it("commits refund, friendship, thread, message, and profile effects together", () => {
    const client = new QueryClient();
    client.setQueryData(webQueryKeys.coins, { balance: 4 });
    client.setQueryData(webQueryKeys.friends, {
      friends: [
        { id: TARGET_ID, friendship_id: FRIENDSHIP_ID },
        { id: OTHER_ID, friendship_id: "77777777-7777-4777-8777-777777777777" },
      ],
      requests: [{ id: FRIENDSHIP_ID, requester_id: TARGET_ID, addressee_id: VIEWER_ID }],
      sentRequests: [],
      sentRequestUserIds: [],
    });
    const targetThread = {
      id: TARGET_THREAD_ID,
      participant_1_id: VIEWER_ID,
      participant_2_id: TARGET_ID,
      unread_count: 3,
    };
    const otherThread = {
      id: OTHER_THREAD_ID,
      participant_1_id: VIEWER_ID,
      participant_2_id: OTHER_ID,
      unread_count: 2,
    };
    client.setQueryData(webQueryKeys.threads, {
      threads: [targetThread, otherThread],
      totalUnread: 5,
    });
    client.setQueryData(webQueryKeys.messages(TARGET_THREAD_ID), { pages: ["secret"] });
    client.setQueryData(webQueryKeys.publicProfile(TARGET_ID), { profile: { id: TARGET_ID } });

    commitBlockedUserCache(client, TARGET_ID, FRIENDSHIP_ID, 5);

    expect(client.getQueryData(webQueryKeys.coins)).toEqual({ balance: 5 });
    expect(client.getQueryData(webQueryKeys.friends)).toMatchObject({
      friends: [{ id: OTHER_ID }],
      requests: [],
    });
    expect(client.getQueryData(webQueryKeys.threads)).toEqual({
      threads: [otherThread],
      totalUnread: 2,
    });
    expect(client.getQueryData(webQueryKeys.messages(TARGET_THREAD_ID))).toBeUndefined();
    expect(client.getQueryData(webQueryKeys.publicProfile(TARGET_ID))).toBeUndefined();
  });

  it("does not overwrite coins when an already-blocked replay has no refund balance", () => {
    const client = new QueryClient();
    client.setQueryData(webQueryKeys.coins, { balance: 2 });

    commitBlockedUserCache(client, TARGET_ID, null, null);

    expect(client.getQueryData(webQueryKeys.coins)).toEqual({ balance: 2 });
  });
});
