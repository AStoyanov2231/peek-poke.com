import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { Friend, ProfileCard, ThreadSummary } from "@peekpoke/shared";
import type { InboxData, SocialData } from "@/data/social/api";
import {
  addThreadToInbox,
  applyFriendResponse,
  commitBlockedUser,
  commitFriendshipBalance,
  removeFriendshipFromSocial,
  removeBlockedUserFromSocial,
  removePeerThreadFromInbox,
} from "@/data/social/cache";
import { nativeQueryKeys } from "@/data/query-keys";

const viewerId = "00000000-0000-4000-8000-000000000001";
const peerId = "00000000-0000-4000-8000-000000000002";
const thirdId = "00000000-0000-4000-8000-000000000003";

function profile(id: string, username: string): ProfileCard {
  return {
    id,
    username,
    display_name: username,
    avatar_url: null,
    location_text: null,
    is_online: false,
    last_seen_at: null,
  };
}

function friendship(
  id: string,
  requesterId: string,
  addresseeId: string,
  status: "pending" | "accepted",
): Friend {
  return {
    id,
    requester_id: requesterId,
    addressee_id: addresseeId,
    status,
    requested_at: "2026-07-30T10:00:00.000Z",
    responded_at: status === "accepted" ? "2026-07-30T10:01:00.000Z" : null,
    requester: profile(requesterId, "requester"),
    addressee: profile(addresseeId, "addressee"),
  };
}

function thread(peer: string, unreadCount = 0): ThreadSummary {
  return {
    id: `10000000-0000-4000-8000-${peer.slice(-12)}`,
    participant_1_id: viewerId,
    participant_2_id: peer,
    last_message_at: "2026-07-30T10:00:00.000Z",
    last_message_preview: "Hello",
    created_at: "2026-07-30T09:00:00.000Z",
    unread_count: unreadCount,
    participant_1: profile(viewerId, "viewer"),
    participant_2: profile(peer, "peer"),
  };
}

function socialData() {
  const incoming = friendship("20000000-0000-4000-8000-000000000001", peerId, viewerId, "pending");
  const outgoing = friendship("20000000-0000-4000-8000-000000000002", viewerId, thirdId, "pending");
  const data: SocialData = {
    friends: [],
    requests: [incoming],
    sentRequests: [outgoing],
    sentRequestUserIds: [thirdId],
  };
  return { data, incoming, outgoing };
}

describe("native social query cache", () => {
  it("stores friendship balances in the canonical coin response shape", () => {
    const queryClient = new QueryClient();

    commitFriendshipBalance(queryClient, 4);

    expect(queryClient.getQueryData(nativeQueryKeys.coins)).toEqual({ balance: 4 });
  });

  it("moves an accepted request into the friends cache", () => {
    const { data, incoming } = socialData();
    const accepted = { ...incoming, status: "accepted" as const };

    const cached = applyFriendResponse(data, incoming.id, "accepted", accepted);

    expect(cached?.requests).toEqual([]);
    expect(cached?.friends).toEqual([accepted]);
  });

  it("removes a cancelled request and its pending-user marker", () => {
    const { data, outgoing } = socialData();

    const cached = removeFriendshipFromSocial(data, outgoing.id);

    expect(cached?.sentRequests).toEqual([]);
    expect(cached?.sentRequestUserIds).toEqual([]);
  });

  it("adds a created thread and removes the peer thread when unfriending", () => {
    const initial: InboxData = {
      threads: [],
      total_unread: 0,
    };
    const created = thread(peerId, 3);

    const withThread = addThreadToInbox(initial, created);
    expect(withThread?.threads).toEqual([created]);

    expect(removePeerThreadFromInbox(withThread, peerId))
      .toEqual({ threads: [], total_unread: 0 });
  });

  it("commits a block by removing friendship, request, thread, chat, and profile cache state", () => {
    const accepted = friendship("20000000-0000-4000-8000-000000000003", viewerId, peerId, "accepted");
    const { data, incoming, outgoing } = socialData();
    const current: SocialData = {
      ...data,
      friends: [accepted],
      requests: [incoming],
      sentRequests: [outgoing],
    };
    expect(removeBlockedUserFromSocial(current, peerId)).toMatchObject({
      friends: [],
      requests: [],
      sentRequests: [outgoing],
      sentRequestUserIds: [thirdId],
    });

    const client = new QueryClient();
    const peerThread = thread(peerId, 3);
    const otherThread = thread(thirdId, 2);
    client.setQueryData(nativeQueryKeys.social.friends, current);
    client.setQueryData(nativeQueryKeys.inbox.threads, {
      threads: [peerThread, otherThread],
      total_unread: 5,
    });
    client.setQueryData(nativeQueryKeys.chat.messages(peerThread.id), { pages: ["secret"] });
    client.setQueryData(nativeQueryKeys.profile.public(peerId), { profile: { id: peerId } });

    commitBlockedUser(client, peerId);

    expect(client.getQueryData<SocialData>(nativeQueryKeys.social.friends)?.friends).toEqual([]);
    expect(client.getQueryData<InboxData>(nativeQueryKeys.inbox.threads)).toMatchObject({
      threads: [otherThread],
      total_unread: 2,
    });
    expect(client.getQueryData(nativeQueryKeys.chat.messages(peerThread.id))).toBeUndefined();
    expect(client.getQueryData(nativeQueryKeys.profile.public(peerId))).toBeUndefined();
  });
});
