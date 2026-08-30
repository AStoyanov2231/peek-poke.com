import {
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { nativeQueryKeys } from "@/data/query-keys";
import {
  fetchBootstrapIdentity,
  fetchInbox,
  fetchSocial,
  type FriendshipMutationData,
  type InboxData,
  type SocialData,
  type ThreadMutationData,
} from "./api";
import {
  addThreadToInbox,
  applyFriendResponse,
  removeFriendshipFromSocial,
  removePeerThreadFromInbox,
} from "./cache";

export const bootstrapIdentityQuery = () => queryOptions({
  queryKey: nativeQueryKeys.bootstrap,
  queryFn: fetchBootstrapIdentity,
  staleTime: 5 * 60_000,
});

export const socialQuery = () => queryOptions({
  queryKey: nativeQueryKeys.social.friends,
  queryFn: fetchSocial,
  staleTime: 30_000,
});

export const inboxQuery = () => queryOptions({
  queryKey: nativeQueryKeys.inbox.threads,
  queryFn: fetchInbox,
  staleTime: 15_000,
});

export function commitFriendResponse(
  queryClient: QueryClient,
  friendshipId: string,
  response: FriendshipMutationData,
) {
  queryClient.setQueryData<SocialData>(
    nativeQueryKeys.social.friends,
    (current) => applyFriendResponse(
      current,
      friendshipId,
      response.status,
      response.friendship,
    ),
  );
}

export function commitFriendshipRemoval(
  queryClient: QueryClient,
  friendshipId: string,
  peerId?: string,
) {
  queryClient.setQueryData<SocialData>(
    nativeQueryKeys.social.friends,
    (current) => removeFriendshipFromSocial(current, friendshipId),
  );
  if (peerId) {
    queryClient.setQueryData<InboxData>(
      nativeQueryKeys.inbox.threads,
      (current) => removePeerThreadFromInbox(current, peerId),
    );
  }
}

export function commitThread(
  queryClient: QueryClient,
  response: ThreadMutationData,
) {
  queryClient.setQueryData<InboxData>(
    nativeQueryKeys.inbox.threads,
    (current) => addThreadToInbox(current, response.thread),
  );
}

export async function invalidateSocialQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: nativeQueryKeys.social.friends }),
    queryClient.invalidateQueries({ queryKey: nativeQueryKeys.social.requests }),
    queryClient.invalidateQueries({ queryKey: nativeQueryKeys.inbox.threads }),
  ]);
}
