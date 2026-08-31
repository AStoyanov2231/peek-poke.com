import { router, useLocalSearchParams, type ErrorBoundaryProps } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Clock3 from "lucide-react-native/icons/clock-3";
import Trash2 from "lucide-react-native/icons/trash-2";
import X from "lucide-react-native/icons/x";
import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  // react-doctor-disable-next-line rn-prefer-reanimated
  Animated,
  Modal,
  // react-doctor-disable-next-line rn-no-panresponder
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ProfileCard, ThreadSummary } from "@peekpoke/shared";
import { isPremium } from "@peekpoke/shared";
import { colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import {
  Avatar,
  Badge,
  BodyBold,
  Button,
  Caption,
  PremiumBadge,
  Screen,
  SegmentedControl,
  Skeleton,
} from "@/components/ui";
import { displayName } from "@/components/ui-helpers";
import { isFriendLimitError } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { ErrorRecovery, RouteErrorRecovery } from "@/components/error-recovery";
import { InboxDataRecovery } from "@/components/inbox-data-recovery";
import { UpgradeDialog } from "@/components/friend-action-dialogs";
import { nativeQueryKeys } from "@/data/query-keys";
import {
  createOrFindThread,
  discardFriendshipRemoval,
  pendingFriendshipRemoval,
  removeFriendship,
  respondToFriendRequest,
  type SocialFriend,
  type SocialProfileCard,
  type SocialData,
} from "@/data/social/api";
import {
  bootstrapIdentityQuery,
  commitFriendResponse,
  commitFriendshipRemoval,
  commitThread,
  inboxQuery,
  socialQuery,
} from "@/data/social/queries";

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorRecovery {...props} title="Couldn't load inbox" />;
}

type Tab = "chats" | "friends" | "requests";
type FriendRowData = SocialFriend & { profile: SocialProfileCard };
type IncomingRequest = SocialFriend & { requester: SocialProfileCard };
type SentRequest = SocialFriend & { addressee: SocialProfileCard };
type Confirmation =
  | { kind: "unfriend"; friend: FriendRowData }
  | { kind: "cancel"; request: SentRequest };

function normalizeTab(value: string | string[] | undefined): Tab {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "friends" || tab === "requests" ? tab : "chats";
}

function friendRows(data: SocialData | undefined, viewerId: string | undefined): FriendRowData[] {
  if (!data || !viewerId) return [];
  return data.friends.flatMap((friend) => {
    const profile = friend.requester_id === viewerId ? friend.addressee : friend.requester;
    return profile ? [{ ...friend, profile }] : [];
  });
}

function incomingRequests(data: SocialData | undefined): IncomingRequest[] {
  if (!data) return [];
  return data.requests.flatMap((request) =>
    request.requester ? [{ ...request, requester: request.requester }] : []
  );
}

function outgoingRequests(data: SocialData | undefined): SentRequest[] {
  if (!data) return [];
  return data.sentRequests.flatMap((request) =>
    request.addressee ? [{ ...request, addressee: request.addressee }] : []
  );
}

// The screen coordinates four tab-specific query/mutation surfaces.
// react-doctor-disable-next-line no-giant-component
export default function InboxScreen() {
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const tab = normalizeTab(params.tab);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const identityQuery = useQuery(bootstrapIdentityQuery());
  const threadsQuery = useQuery(inboxQuery());
  const socialDataQuery = useQuery(socialQuery());
  const threads = threadsQuery.data?.threads ?? [];
  const unread = threadsQuery.data?.total_unread ?? 0;
  const inboxLoading = threadsQuery.isLoading || identityQuery.isLoading;
  const inboxError = threadsQuery.error ?? identityQuery.error;
  const socialLoading = socialDataQuery.isLoading || identityQuery.isLoading;
  const socialError = socialDataQuery.error ?? identityQuery.error;
  const socialData = socialDataQuery.data;
  const friends = useMemo(
    () => friendRows(socialData, identityQuery.data?.identity.id),
    [identityQuery.data?.identity.id, socialData],
  );
  const requests = useMemo(
    () => incomingRequests(socialData),
    [socialData],
  );
  const sentRequests = useMemo(
    () => outgoingRequests(socialData),
    [socialData],
  );
  const friendResponseMutation = useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: "accepted" | "declined" }) =>
      respondToFriendRequest(requestId, status, (response) => {
        commitFriendResponse(queryClient, requestId, response);
      }),
  });
  const removeFriendshipMutation = useMutation({
    mutationFn: ({ friendshipId, peerId }: { friendshipId: string; peerId?: string }) =>
      removeFriendship(friendshipId, (response) => {
        commitFriendshipRemoval(queryClient, friendshipId, peerId);
        if (response.balance !== null) {
          queryClient.setQueryData(nativeQueryKeys.coins, { balance: response.balance });
        }
      }),
  });
  const threadMutation = useMutation({
    mutationFn: createOrFindThread,
    onSuccess: (response) => {
      commitThread(queryClient, response);
      queryClient.setQueryData(nativeQueryKeys.coins, { balance: response.balance });
    },
  });

  const onlineFriends = useMemo(
    () => friends.filter((friend) => friend.profile.is_online),
    [friends],
  );
  const offlineFriends = useMemo(
    () => friends.filter((friend) => !friend.profile.is_online),
    [friends],
  );

  function setProcessing(id: string, processing: boolean) {
    setProcessingIds((current) => {
      const next = new Set(current);
      if (processing) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function retryInbox() {
    void Promise.all([threadsQuery.refetch(), identityQuery.refetch()]);
  }

  function retrySocial() {
    void Promise.all([socialDataQuery.refetch(), identityQuery.refetch()]);
  }

  async function openFriendChat(friend: ProfileCard) {
    if (processingIds.has(friend.id)) return;

    const existing = threads.find(
      (thread) =>
        (thread.participant_1_id === identityQuery.data?.identity.id && thread.participant_2_id === friend.id) ||
        (thread.participant_2_id === identityQuery.data?.identity.id && thread.participant_1_id === friend.id),
    );
    if (existing) {
      router.push(`/chat/${existing.id}` as never);
      return;
    }

    setProcessing(friend.id, true);
    try {
      const data = await threadMutation.mutateAsync(friend.id);
      const threadId = data.id;
      if (!threadId) throw new Error("Conversation could not be opened.");
      router.push(`/chat/${threadId}` as never);
    } catch (error) {
      Alert.alert("Chat failed", error instanceof Error ? error.message : "Try again.");
    } finally {
      setProcessing(friend.id, false);
    }
  }

  async function respondToRequest(request: IncomingRequest, status: "accepted" | "declined") {
    if (processingIds.has(request.id)) return;
    setProcessing(request.id, true);
    try {
      await friendResponseMutation.mutateAsync({ requestId: request.id, status });
    } catch (error) {
      if (isFriendLimitError(error)) {
        setUpgradeMessage(error.message);
      } else {
        Alert.alert("Request failed", error instanceof Error ? error.message : "Try again.");
      }
    } finally {
      setProcessing(request.id, false);
    }
  }

  async function unfriend(friend: FriendRowData) {
    if (processingIds.has(friend.id)) return;
    setConfirmation(null);
    setProcessing(friend.id, true);
    try {
      await removeFriendshipMutation.mutateAsync({
        friendshipId: friend.id,
        peerId: friend.profile.id,
      });
    } catch (error) {
      if (pendingFriendshipRemoval(friend.id)) {
        showRemovalRecovery(
          friend.id,
          "remove friend",
          () => void unfriend(friend),
        );
      } else {
        Alert.alert("Could not remove friend", error instanceof Error ? error.message : "Try again.");
      }
    } finally {
      setProcessing(friend.id, false);
    }
  }

  async function cancelSentRequest(request: SentRequest) {
    if (processingIds.has(request.id)) return;
    setConfirmation(null);
    setProcessing(request.id, true);
    try {
      await removeFriendshipMutation.mutateAsync({ friendshipId: request.id });
    } catch (error) {
      if (pendingFriendshipRemoval(request.id)) {
        showRemovalRecovery(
          request.id,
          "cancel request",
          () => void cancelSentRequest(request),
        );
      } else {
        Alert.alert("Could not cancel request", error instanceof Error ? error.message : "Try again.");
      }
    } finally {
      setProcessing(request.id, false);
    }
  }

  function showRemovalRecovery(
    friendshipId: string,
    action: string,
    retry: () => void,
  ) {
    Alert.alert(
      "Removal status unknown",
      `The server may already have completed this ${action}. Retry the exact attempt or discard it and refresh.`,
      [
        { text: "Keep for later", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            discardFriendshipRemoval(friendshipId);
            void socialDataQuery.refetch();
          },
        },
        { text: "Retry", onPress: retry },
      ],
    );
  }

  return (
    <Screen scroll contentStyle={styles.screenContent}>
      <View style={styles.header}>
        <Text style={styles.title}>Inbox</Text>
      </View>

      <View style={styles.tabsWrap}>
        <SegmentedControl
          value={tab}
          onChange={(nextTab) => router.setParams({ tab: nextTab })}
          options={[
            { value: "chats", label: "Chats", badge: unread },
            { value: "friends", label: "Friends" },
            { value: "requests", label: "Requests", badge: requests.length },
          ]}
        />
      </View>

      {threadsQuery.error && threadsQuery.data ? (
        <InboxDataRecovery
          pending={threadsQuery.isFetching}
          onRetry={retryInbox}
        />
      ) : null}

      {tab === "chats" ? (
        <View style={styles.list}>
          {inboxLoading && threads.length === 0 ? (
            <InboxSkeleton />
          ) : inboxError && threads.length === 0 ? (
            <ErrorRecovery
              error={inboxError instanceof Error ? inboxError : new Error("Inbox load failed")}
              fill={false}
              onRetry={retryInbox}
              title="Couldn't load inbox"
            />
          ) : threads.length === 0 ? (
            <InboxEmpty title="No conversations yet" description="Find friends on the map to start chatting" />
          ) : (
            threads.map((thread) => {
              const other = thread.participant_1_id === identityQuery.data?.identity.id
                ? thread.participant_2
                : thread.participant_1;
              return (
                <ChatRow
                  key={thread.id}
                  thread={thread}
                  other={other}
                  online={other?.is_online ?? false}
                />
              );
            })
          )}
        </View>
      ) : null}

      {tab === "friends" ? (
        <View style={styles.list}>
          {socialLoading ? (
            <InboxSkeleton />
          ) : socialError ? (
            <ErrorRecovery
              error={socialError instanceof Error
                ? socialError
                : new Error("Friends load failed")}
              fill={false}
              onRetry={retrySocial}
              title="Couldn't load friends"
            />
          ) : friends.length === 0 && sentRequests.length === 0 ? (
            <InboxEmpty title="No friends yet" />
          ) : (
            <>
              {onlineFriends.length > 0 ? (
                <FriendSectionLabel>Online · {onlineFriends.length}</FriendSectionLabel>
              ) : null}
              {onlineFriends.map((friend) => (
                <FriendRow
                  key={friend.id}
                  friend={friend}
                  online
                  processing={processingIds.has(friend.id) || processingIds.has(friend.profile.id)}
                  onOpenChat={() => openFriendChat(friend.profile)}
                  onRemove={() => setConfirmation({ kind: "unfriend", friend })}
                />
              ))}

              {offlineFriends.length > 0 ? (
                <FriendSectionLabel>
                  {friends.length} {friends.length === 1 ? "friend" : "friends"}
                </FriendSectionLabel>
              ) : null}
              {offlineFriends.map((friend) => (
                <FriendRow
                  key={friend.id}
                  friend={friend}
                  online={false}
                  processing={processingIds.has(friend.id) || processingIds.has(friend.profile.id)}
                  onOpenChat={() => openFriendChat(friend.profile)}
                  onRemove={() => setConfirmation({ kind: "unfriend", friend })}
                />
              ))}

              {sentRequests.length > 0 ? <FriendSectionLabel pending>Pending</FriendSectionLabel> : null}
              {sentRequests.map((request) => (
                <SentRequestRow
                  key={request.id}
                  request={request}
                  processing={processingIds.has(request.id)}
                  onCancel={() => setConfirmation({ kind: "cancel", request })}
                />
              ))}
            </>
          )}
        </View>
      ) : null}

      {tab === "requests" ? (
        <View style={styles.list}>
          {socialLoading ? (
            <InboxSkeleton />
          ) : socialError ? (
            <ErrorRecovery
              error={socialError instanceof Error
                ? socialError
                : new Error("Friend requests load failed")}
              fill={false}
              onRetry={retrySocial}
              title="Couldn't load requests"
            />
          ) : requests.length === 0 ? (
            <InboxEmpty title="No pending requests" />
          ) : (
            <>
              <FriendSectionLabel>Incoming</FriendSectionLabel>
              {requests.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  processing={processingIds.has(request.id)}
                  onAccept={() => respondToRequest(request, "accepted")}
                  onDecline={() => respondToRequest(request, "declined")}
                />
              ))}
            </>
          )}
        </View>
      ) : null}

      <ConfirmationDialog
        confirmation={confirmation}
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation?.kind === "unfriend") void unfriend(confirmation.friend);
          if (confirmation?.kind === "cancel") void cancelSentRequest(confirmation.request);
        }}
      />
      <UpgradeDialog
        message={upgradeMessage}
        onClose={() => setUpgradeMessage(null)}
        onUpgrade={() => router.navigate("/(app)/premium" as never)}
      />
    </Screen>
  );
}

function ChatRow({ thread, other, online }: { thread: ThreadSummary; other?: ProfileCard; online: boolean }) {
  const name = displayName(other);
  const unread = thread.unread_count ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/chat/${thread.id}` as never)}
      style={({ pressed }) => [styles.row, styles.chatRow, pressed && styles.rowPressed]}
    >
      <Pressable
        accessibilityLabel={`View ${name}'s profile`}
        onPress={(event) => {
          event.stopPropagation();
          if (other?.id) router.push(`/(app)/profile/${other.id}` as never);
        }}
      >
        <Avatar name={name} uri={other?.avatar_url} size={52} online={online} />
      </Pressable>
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <BodyBold numberOfLines={1} style={[styles.rowName, unread === 0 && styles.readName]}>
            {name}
          </BodyBold>
          {thread.last_message_at ? <Caption>{formatRelativeTime(thread.last_message_at)}</Caption> : null}
        </View>
        <View style={styles.rowBottom}>
          {thread.last_message_preview ? (
            <Text numberOfLines={1} style={[styles.preview, unread > 0 && styles.previewUnread]}>
              {thread.last_message_preview}
            </Text>
          ) : null}
          {unread > 0 ? <Badge>{unread > 9 ? "9+" : unread}</Badge> : null}
        </View>
      </View>
    </Pressable>
  );
}

function FriendRow({
  friend,
  online,
  processing,
  onOpenChat,
  onRemove,
}: {
  friend: FriendRowData;
  online: boolean;
  processing: boolean;
  onOpenChat: () => void;
  onRemove: () => void;
}) {
  const name = displayName(friend.profile);
  return (
    <SwipeableFriendRow disabled={processing} onSwipeComplete={onRemove}>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenChat}
        style={({ pressed }) => [styles.row, styles.friendRow, pressed && styles.rowPressed]}
      >
        <Pressable
          accessibilityLabel={`View ${name}'s profile`}
          onPress={(event) => {
            event.stopPropagation();
            router.push(`/(app)/profile/${friend.profile.id}` as never);
          }}
        >
          <Avatar name={name} uri={friend.profile.avatar_url} size={44} online={online} />
        </Pressable>
        <View style={styles.rowMain}>
          <View style={styles.friendNameRow}>
            <BodyBold numberOfLines={1} style={styles.rowName}>{name}</BodyBold>
            {isPremium(friend.profile) ? <PremiumBadge /> : null}
          </View>
          <Caption style={online ? styles.onlineText : undefined}>
            {online
              ? "Online"
              : friend.profile.last_seen_at
                ? `Last seen ${formatRelativeTime(friend.profile.last_seen_at)}`
                : `@${friend.profile.username}`}
          </Caption>
        </View>
        {processing ? (
          <ActivityIndicator color={colors.ink[5]} size="small" />
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onPress={(event) => {
              event.stopPropagation();
              onOpenChat();
            }}
          >
            Message
          </Button>
        )}
      </Pressable>
    </SwipeableFriendRow>
  );
}

function SentRequestRow({ request, processing, onCancel }: { request: SentRequest; processing: boolean; onCancel: () => void }) {
  const name = displayName(request.addressee);
  return (
    <View style={[styles.row, styles.friendRow]}>
      <Avatar name={name} uri={request.addressee.avatar_url} size={44} />
      <View style={styles.rowMain}>
        <View style={styles.friendNameRow}>
          <Pressable onPress={() => router.push(`/(app)/profile/${request.addressee.id}` as never)}>
            <BodyBold numberOfLines={1}>{name}</BodyBold>
          </Pressable>
          {isPremium(request.addressee) ? <PremiumBadge /> : null}
        </View>
        <View style={styles.pendingRow}>
          <Clock3 color={colors.ink[5]} size={12} strokeWidth={2} />
          <Caption>Pending</Caption>
        </View>
      </View>
      <Pressable
        accessibilityLabel="Cancel sent request"
        disabled={processing}
        onPress={onCancel}
        style={({ pressed }) => [styles.cancelButton, pressed && styles.rowPressed, processing && styles.disabled]}
      >
        {processing ? <ActivityIndicator color={colors.ink[5]} size="small" /> : <X color={colors.ink[7]} size={16} />}
      </Pressable>
    </View>
  );
}

function RequestRow({
  request,
  processing,
  onAccept,
  onDecline,
}: {
  request: IncomingRequest;
  processing: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const requester = request.requester;
  const name = displayName(requester);
  return (
    <View style={[styles.row, styles.friendRow]}>
      <Avatar name={name} uri={requester.avatar_url} size={44} />
      <View style={styles.rowMain}>
        <View style={styles.friendNameRow}>
          <Pressable onPress={() => router.push(`/(app)/profile/${requester.id}` as never)}>
            <BodyBold numberOfLines={1}>{name}</BodyBold>
          </Pressable>
          {isPremium(requester) ? <PremiumBadge /> : null}
        </View>
        <Caption numberOfLines={1}>@{requester.username}</Caption>
      </View>
      <View style={styles.requestActions}>
        <Button size="sm" variant="ghost" disabled={processing} onPress={onDecline}>Decline</Button>
        <Button size="sm" variant="accent" disabled={processing} loading={processing} onPress={onAccept}>Accept</Button>
      </View>
    </View>
  );
}

function FriendSectionLabel({ children, pending = false }: { children: ReactNode; pending?: boolean }) {
  return <Text style={[styles.sectionLabel, pending && styles.pendingSection]}>{children}</Text>;
}

function InboxEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
    </View>
  );
}

function InboxSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map((item) => <Skeleton key={item} style={styles.skeletonRow} />)}
    </View>
  );
}

function SwipeableFriendRow({ children, disabled, onSwipeComplete }: { children: ReactNode; disabled: boolean; onSwipeComplete: () => void }) {
  const [translateX] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(1);
  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        !disabled && gesture.dx < -10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_event, gesture) => {
        translateX.setValue(Math.max(-width * 0.8, Math.min(0, gesture.dx)));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (Math.abs(gesture.dx) / width > 0.5) onSwipeComplete();
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 0 }).start();
      },
    }),
    [disabled, onSwipeComplete, translateX, width],
  );

  const opacity = translateX.interpolate({ inputRange: [-120, -10, 0], outputRange: [1, 0.2, 0], extrapolate: "clamp" });
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={styles.swipeContainer}
      {...panResponder.panHandlers}
    >
      <Animated.View style={[styles.swipeDelete, { opacity }]}>
        <Trash2 color={colors.surface} size={24} strokeWidth={2} />
      </Animated.View>
      <Animated.View style={[styles.swipeContent, { transform: [{ translateX }] }]}>{children}</Animated.View>
    </View>
  );
}

function ConfirmationDialog({ confirmation, onClose, onConfirm }: { confirmation: Confirmation | null; onClose: () => void; onConfirm: () => void }) {
  const isUnfriend = confirmation?.kind === "unfriend";
  const name = confirmation
    ? displayName(confirmation.kind === "unfriend"
      ? confirmation.friend.profile
      : confirmation.request.addressee)
    : "";
  return (
    <Modal animationType="fade" transparent visible={!!confirmation} onRequestClose={onClose}>
      <View style={styles.dialogBackdrop}>
        <View accessibilityViewIsModal style={styles.dialogCard}>
          <Text style={styles.dialogTitle}>{isUnfriend ? "Remove friend?" : "Cancel friend request?"}</Text>
          <Text style={styles.dialogDescription}>
            {isUnfriend
              ? `Are you sure you want to remove ${name} from your friends? You can always add them back later.`
              : `Are you sure you want to cancel your friend request to ${name}? You can send a new request later.`}
          </Text>
          <View style={styles.dialogActions}>
            <Button fullWidth size="sm" style={styles.dialogButton} textStyle={styles.dialogButtonText} variant="danger" onPress={onConfirm}>
              {isUnfriend ? "Yes, remove" : "Yes, cancel"}
            </Button>
            <Button fullWidth size="sm" style={styles.dialogButton} textStyle={styles.dialogButtonText} variant="secondary" onPress={onClose}>No</Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: spacing[4],
    gap: 0,
  },
  header: {
    paddingBottom: spacing[3],
  },
  title: {
    ...typography.title1,
    color: colors.ink[9],
  },
  tabsWrap: {
    paddingBottom: spacing[3],
  },
  list: {
    marginHorizontal: -spacing[2],
    gap: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    borderRadius: radii.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  chatRow: {
    minHeight: 76,
  },
  friendRow: {
    minHeight: 68,
    backgroundColor: colors.background,
  },
  rowPressed: {
    backgroundColor: colors.ink[1],
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  rowBottom: {
    minHeight: 18,
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  rowName: {
    flexShrink: 1,
    color: colors.ink[9],
  },
  readName: {
    color: colors.ink[8],
  },
  preview: {
    ...typography.caption,
    flex: 1,
    color: colors.ink[5],
  },
  previewUnread: {
    color: colors.ink[8],
    fontFamily: fontFamilies.semibold,
    fontWeight: "600",
  },
  friendNameRow: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  onlineText: {
    color: colors.success[600],
    fontFamily: fontFamilies.medium,
    fontWeight: "500",
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  requestActions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  sectionLabel: {
    ...typography.micro,
    color: colors.ink[5],
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
  },
  pendingSection: {
    paddingTop: spacing[4],
  },
  empty: {
    height: 192,
    paddingHorizontal: spacing[8],
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    ...typography.body,
    color: colors.ink[5],
    textAlign: "center",
  },
  emptyDescription: {
    ...typography.caption,
    marginTop: spacing[1],
    color: colors.ink[5],
    textAlign: "center",
  },
  skeletonList: {
    paddingHorizontal: spacing[1],
    paddingTop: spacing[3],
    gap: spacing[1],
  },
  skeletonRow: {
    width: "100%",
    height: 72,
    borderRadius: radii.md,
  },
  swipeContainer: {
    position: "relative",
    overflow: "hidden",
    borderRadius: radii.md,
  },
  swipeDelete: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingRight: spacing[6],
    alignItems: "flex-end",
    justifyContent: "center",
    backgroundColor: colors.danger[500],
  },
  swipeContent: {
    backgroundColor: colors.background,
  },
  dialogBackdrop: {
    flex: 1,
    padding: spacing[6],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.scrim,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radii.lg,
    padding: spacing[6],
    gap: spacing[4],
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  dialogTitle: {
    ...typography.title3,
    color: colors.ink[9],
  },
  dialogDescription: {
    ...typography.body,
    color: colors.ink[5],
  },
  dialogActions: {
    gap: spacing[2],
  },
  dialogButton: {
    minHeight: 36,
  },
  dialogButtonText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
