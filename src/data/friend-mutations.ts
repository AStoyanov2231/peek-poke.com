import {
  blockUserResponseSchema,
  createBlockUserAttemptCoordinator,
  createFriendResponseAttemptCoordinator,
  createFriendRequestAttemptCoordinator,
  createFriendRemovalAttemptCoordinator,
  friendshipCreateResponseSchema,
  friendshipRemovalResponseSchema,
  friendshipResponseSchema,
  type FriendshipCreateResponse,
  type FriendshipRemovalResponse,
  type FriendshipResponse,
  type BlockUserResponse,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

const friendRequestAttempts = createFriendRequestAttemptCoordinator(() => crypto.randomUUID());
const friendResponseAttempts = createFriendResponseAttemptCoordinator(() => crypto.randomUUID());
const friendRemovalAttempts = createFriendRemovalAttemptCoordinator(() => crypto.randomUUID());
const blockUserAttempts = createBlockUserAttemptCoordinator(() => crypto.randomUUID());

export function sendFriendRequest(
  addresseeId: string,
  commit?: (response: FriendshipCreateResponse) => void,
): Promise<FriendshipCreateResponse> {
  return friendRequestAttempts.run(
    addresseeId,
    (attempt) => fetchContract("/api/friends", friendshipCreateResponseSchema, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": attempt.key,
      },
      body: attempt.serializedBody,
    }),
    commit,
  );
}

export function cancelFriendRequestAttempt(addresseeId: string) {
  return friendRequestAttempts.cancel(addresseeId);
}

export function respondToFriendRequest(
  friendshipId: string,
  status: "accepted" | "declined",
  commit?: (response: FriendshipResponse) => void,
): Promise<FriendshipResponse> {
  return friendResponseAttempts.run(
    friendshipId,
    status,
    (attempt) => fetchContract(
      `/api/friends/${encodeURIComponent(attempt.friendshipId)}`,
      friendshipResponseSchema,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": attempt.key,
        },
        body: attempt.serializedBody,
      },
    ),
    commit,
  );
}

export function resetFriendMutationAttempts() {
  friendRequestAttempts.reset();
  friendResponseAttempts.reset();
  friendRemovalAttempts.reset();
  blockUserAttempts.reset();
}

export function removeFriendship(
  friendshipId: string,
  commit?: (response: FriendshipRemovalResponse) => void,
): Promise<FriendshipRemovalResponse> {
  return friendRemovalAttempts.run(
    friendshipId,
    (attempt) => fetchContract(
      `/api/friends/${encodeURIComponent(attempt.friendshipId)}`,
      friendshipRemovalResponseSchema,
      { method: "DELETE", headers: { "idempotency-key": attempt.key } },
    ),
    commit,
  );
}

export function pendingFriendshipRemoval(friendshipId: string) {
  return friendRemovalAttempts.peek(friendshipId);
}

export function discardFriendshipRemoval(friendshipId: string) {
  return friendRemovalAttempts.discard(friendshipId);
}

export function blockUser(
  targetUserId: string,
  commit?: (response: BlockUserResponse) => void,
): Promise<BlockUserResponse> {
  return blockUserAttempts.run(
    targetUserId,
    (attempt) => fetchContract(
      `/api/users/${encodeURIComponent(attempt.targetUserId)}/block`,
      blockUserResponseSchema,
      { method: "POST", headers: { "idempotency-key": attempt.key } },
    ),
    commit,
  );
}

export function pendingBlockUser(targetUserId: string) {
  return blockUserAttempts.peek(targetUserId);
}

export function discardBlockUser(targetUserId: string) {
  return blockUserAttempts.discard(targetUserId);
}
