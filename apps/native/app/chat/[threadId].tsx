import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import Copy from "lucide-react-native/icons/copy";
import CornerUpLeft from "lucide-react-native/icons/corner-up-left";
import ImageIcon from "lucide-react-native/icons/image";
import Pencil from "lucide-react-native/icons/pencil";
import Trash2 from "lucide-react-native/icons/trash-2";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  // react-doctor-disable-next-line rn-prefer-reanimated
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  // react-doctor-disable-next-line rn-no-panresponder
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  createChatMessageAttemptCoordinator,
  createChatMessageUiLifecycle,
  createDmMessageMutationCoordinator,
  appendEditableChatSuggestion,
  EDIT_WINDOW_MINUTES,
  isPremium,
  mergeNewestFirstMessagePages,
  type ChatMessageDraft,
  type ChatMessageSubmissionToken,
  type DMMessage,
  type DmMessageMutationAttempt,
  venueSuggestionsResponseSchema,
  type ChatSuggestionsResponse,
  type VenueCard,
  type VenueSuggestionsResponse,
} from "@peekpoke/shared";
import { colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import { Avatar, Body, Caption, IconButton, PremiumBadge, Skeleton } from "@/components/ui";
import { displayName } from "@/components/ui-helpers";
import { fetchCurrentProfile, fetchMessages, type MessagesData } from "@/data/api";
import { uploadAndSendChatMedia } from "@/data/chat-upload";
import { sendPreparedChatMessage } from "@/data/chat-message";
import { mutatePreparedNativeDmMessage } from "@/data/dm-message-mutations";
import { nativeQueryKeys } from "@/data/query-keys";
import { useTypingIndicator } from "@/hooks/use-typing-indicator";
import { useAppStore } from "@/state/app-store";
import { useCallStore } from "@/state/call-store";
import { ChatMeetupAcknowledgement } from "@/components/chat-meetup-acknowledgement";
import { ChatApproximateProximityHint } from "@/components/chat-approximate-proximity-hint";
import { useReadReceipt } from "@/hooks/use-read-receipt";
import { ReadReceiptRecovery } from "@/components/read-receipt-recovery";
import { PlanComposer } from "@/components/plan-composer";
import { ChatMomentumActions } from "@/components/chat-momentum-actions";
import { fetchChatSuggestions } from "@/data/chat-suggestions";
import { apiFetch } from "@/lib/api";
import { useChatApproximateProximity } from "@/hooks/use-chat-approximate-proximity";

const EMPTY_MESSAGES: DMMessage[] = [];

// This route coordinates chat state, gestures, and navigation for the screen.
// react-doctor-disable-next-line no-giant-component
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const listRef = useRef<FlatList<DMMessage>>(null);
  const [planComposerOpen, setPlanComposerOpen] = useState(false);
  const [planPlacePrefill, setPlanPlacePrefill] = useState("");
  const loadingOlderRef = useRef(false);
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: nativeQueryKeys.profile.current,
    queryFn: fetchCurrentProfile,
  });
  const conversationQuery = useInfiniteQuery({
    queryKey: nativeQueryKeys.chat.messages(threadId),
    queryFn: ({ pageParam, signal }) => fetchMessages(threadId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pagination.has_more
      ? lastPage.pagination.next_cursor ?? undefined
      : undefined,
    enabled: Boolean(threadId),
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const profile = profileQuery.data;
  const storedMessages = useMemo(() => {
    const pages = conversationQuery.data?.pages;
    if (!pages) return EMPTY_MESSAGES;
    return mergeNewestFirstMessagePages(pages) as DMMessage[];
  }, [conversationQuery.data?.pages]);
  const draft = useAppStore((state) => state.drafts[threadId] ?? "");
  const setDraft = useAppStore((state) => state.setDraft);
  const setActiveThreadId = useAppStore((state) => state.setActiveThreadId);
  const setActiveGroupId = useAppStore((state) => state.setActiveGroupId);
  const readReceipt = useReadReceipt(profileQuery.data?.id, threadId);
  const thread = conversationQuery.data?.pages[0]?.thread ?? null;
  const [sending, setSending] = useState(false);
  const [hasPendingImage, setHasPendingImage] = useReducer(
    (_current: boolean, next: boolean) => next,
    false,
  );
  const lifecycleOwnerRef = useRef<PropertyKey | null>(null);
  const [sendAttempts] = useState(() =>
    createChatMessageAttemptCoordinator(() => Crypto.randomUUID()),
  );
  const [sendLifecycle] = useState(() =>
    createChatMessageUiLifecycle(() => lifecycleOwnerRef.current),
  );
  const [messageMutations] = useState(() =>
    createDmMessageMutationCoordinator(() => Crypto.randomUUID()),
  );
  const [replyingTo, setReplyingTo] = useState<DMMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<DMMessage | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [contextMessage, setContextMessage] = useState<DMMessage | null>(null);
  const [contextCanEdit, setContextCanEdit] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const lifecycleOwnerIdentity = JSON.stringify([threadId, profile?.id ?? null]);
  useLayoutEffect(() => {
    lifecycleOwnerRef.current = lifecycleOwnerIdentity;
    return () => {
      lifecycleOwnerRef.current = null;
      sendAttempts.reset();
      sendLifecycle.reset();
      messageMutations.reset();
    };
  }, [lifecycleOwnerIdentity, messageMutations, sendAttempts, sendLifecycle]);

  useEffect(() => {
    setSending(false);
    setHasPendingImage(false);
    setReplyingTo(null);
    setEditingMessage(null);
    setEditError(null);
  }, [lifecycleOwnerIdentity]);

  useEffect(() => {
    if (!threadId) return;
    setActiveThreadId(threadId);
    setActiveGroupId(null);
    return () => {
      if (useAppStore.getState().activeThreadId === threadId) {
        useAppStore.getState().setActiveThreadId(null);
      }
    };
  }, [queryClient, setActiveGroupId, setActiveThreadId, threadId]);

  useEffect(() => {
    if (!conversationQuery.error) return;
    Alert.alert(
      "Conversation failed",
      conversationQuery.error instanceof Error ? conversationQuery.error.message : "Try again.",
    );
  }, [conversationQuery.error]);

  const other = useMemo(() => {
    if (!thread || !profile) return null;
    return thread.participant_1_id === profile.id ? thread.participant_2 : thread.participant_1;
  }, [profile, thread]);
  const isInSameApproximateArea = useChatApproximateProximity(profile?.id, other?.id);
  const isReadOnly = other?.account_deleted === true;
  const suggestionsQuery = useQuery<ChatSuggestionsResponse>({
    queryKey: nativeQueryKeys.chat.suggestions(threadId),
    queryFn: ({ signal }) => fetchChatSuggestions(threadId, signal),
    enabled: Boolean(threadId && other && !isReadOnly),
    staleTime: 30_000,
  });
  const venuesQuery = useQuery<VenueSuggestionsResponse>({ queryKey: ["chat", threadId, "venues"], enabled: Boolean(threadId && other && !isReadOnly), queryFn: () => apiFetch<VenueSuggestionsResponse>(`/api/dm/${threadId}/venues`, { responseSchema: venueSuggestionsResponseSchema }), staleTime: 60_000 });
  const { isPeerTyping, notifyTyping } = useTypingIndicator(threadId, profile?.id);
  const isOtherOnline = other?.is_online === true && !isReadOnly;

  async function submit() {
    const content = draft.trim();
    if (!content || !threadId || sending) return;
    if (isReadOnly && !editingMessage) return;
    const token = sendLifecycle.begin();
    if (!token) return;
    setSending(true);
    setEditError(null);

    if (editingMessage) {
      if (!profile?.id) {
        sendLifecycle.end(token);
        setSending(false);
        return;
      }
      let attempt: DmMessageMutationAttempt;
      try {
        attempt = messageMutations.prepare(
          { accountId: profile.id, threadId, messageId: editingMessage.id },
          { kind: "edit", content },
        );
        const data = await messageMutations.run(
          attempt.scope,
          attempt.mutation,
          mutatePreparedNativeDmMessage,
        );
        sendLifecycle.commitOnce(token, token.nonce, () => {
          if (!messageMutations.isGenerationCurrent(attempt)) return;
          updateCachedMessage(queryClient, threadId, data.message);
          setEditingMessage(null);
          setEditError(null);
          setDraft(threadId, "");
        });
      } catch (error) {
        sendLifecycle.commitOnce(token, token.nonce, () => {
          const current = messageMutations.peek();
          if (current && !messageMutations.isGenerationCurrent(current)) return;
          setEditError(error instanceof Error ? error.message : "Failed to edit message");
        });
      } finally {
        sendLifecycle.runIfCurrent(token, () => setSending(false));
        sendLifecycle.end(token);
      }
      return;
    }

    const messageDraft: ChatMessageDraft = {
      content,
      replyToId: replyingTo?.id,
    };
    if (sendAttempts.peek()?.draft.mediaUrl) {
      sendAttempts.cancel();
      setHasPendingImage(false);
    }
    try {
      const attempt = sendAttempts.prepare(messageDraft);
      const data = await sendAttempts.run(messageDraft, (pendingAttempt) =>
        sendPreparedChatMessage(threadId, pendingAttempt),
      );
      sendLifecycle.commitOnce(token, attempt.clientId, () => {
        appendCachedMessage(queryClient, threadId, data.message);
        setDraft(threadId, "");
        setReplyingTo(null);
        setHasPendingImage(false);
      });
    } catch (error) {
      sendLifecycle.commitOnce(token, token.nonce, () => {
        Alert.alert("Send failed", error instanceof Error ? error.message : "Try again.");
      });
    } finally {
      sendLifecycle.runIfCurrent(token, () => setSending(false));
      sendLifecycle.end(token);
    }
  }

  function discardPendingImage() {
    if (!sendAttempts.cancel()) return;
    setHasPendingImage(false);
  }

  function showPendingImageActions(
    token: ChatMessageSubmissionToken,
    clientId: string,
    message = "The upload is ready and will not be repeated.",
  ) {
    const isCurrentPendingImage = () =>
      sendLifecycle.isGenerationCurrent(token)
      && sendAttempts.peek()?.clientId === clientId;
    Alert.alert("Photo not sent", message, [
      {
        text: "Discard",
        style: "cancel",
        onPress: () => {
          if (!isCurrentPendingImage()) return;
          discardPendingImage();
        },
      },
      {
        text: "Choose another",
        onPress: () => {
          if (!isCurrentPendingImage()) return;
          discardPendingImage();
          void selectAndSendImage();
        },
      },
      {
        text: "Retry",
        onPress: () => {
          if (!isCurrentPendingImage()) return;
          void retryPendingImage();
        },
      },
    ]);
  }

  async function retryPendingImage() {
    const attempt = sendAttempts.peek();
    if (!threadId || !attempt?.draft.mediaUrl || sending) return;
    const token = sendLifecycle.begin();
    if (!token) return;
    setSending(true);
    setEditError(null);
    try {
      const data = await sendAttempts.run(attempt.draft, (pendingAttempt) =>
        sendPreparedChatMessage(threadId, pendingAttempt),
      );
      sendLifecycle.commitOnce(token, attempt.clientId, () => {
        appendCachedMessage(queryClient, threadId, data.message);
        setReplyingTo(null);
        setHasPendingImage(false);
      });
    } catch (error) {
      sendLifecycle.commitOnce(token, token.nonce, () => {
        setHasPendingImage(true);
        showPendingImageActions(
          token,
          attempt.clientId,
          error instanceof Error ? error.message : "Try again.",
        );
      });
    } finally {
      sendLifecycle.runIfCurrent(token, () => setSending(false));
      sendLifecycle.end(token);
    }
  }

  async function selectAndSendImage() {
    if (!threadId || !profile?.id || sending || editingMessage || isReadOnly) return;
    const token = sendLifecycle.begin();
    if (!token) return;
    discardPendingImage();
    setSending(true);
    setEditError(null);
    const reply = replyingTo;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.82,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? "message.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as never);
      let clientId: string | null = null;
      const data = await uploadAndSendChatMedia(formData, profile.id, (upload) => {
        const messageDraft = {
          content: "Photo",
          mediaUrl: upload.url,
          mediaThumbnailUrl: upload.thumbnailUrl,
          replyToId: reply?.id,
        };
        const attempt = sendAttempts.prepare(messageDraft);
        clientId = attempt.clientId;
        return sendAttempts.run(messageDraft, (pendingAttempt) =>
          sendPreparedChatMessage(threadId, pendingAttempt),
        );
      });
      if (!clientId) throw new Error("Photo send attempt was not created");
      sendLifecycle.commitOnce(token, clientId, () => {
        setReplyingTo(null);
        setHasPendingImage(false);
        appendCachedMessage(queryClient, threadId, data.message);
      });
    } catch (error) {
      sendLifecycle.commitOnce(token, token.nonce, () => {
        const pendingAttempt = sendAttempts.peek();
        if (pendingAttempt?.draft.mediaUrl) {
          setHasPendingImage(true);
          showPendingImageActions(
            token,
            pendingAttempt.clientId,
            error instanceof Error ? error.message : "Try again.",
          );
        } else {
          Alert.alert("Photo upload failed", error instanceof Error ? error.message : "Try again.");
        }
      });
    } finally {
      sendLifecycle.runIfCurrent(token, () => setSending(false));
      sendLifecycle.end(token);
    }
  }

  function sendImage() {
    const pendingAttempt = sendAttempts.peek();
    if (pendingAttempt?.draft.mediaUrl) {
      const token = sendLifecycle.begin();
      if (!token) return;
      showPendingImageActions(token, pendingAttempt.clientId);
      sendLifecycle.end(token);
      return;
    }
    void selectAndSendImage();
  }

  async function deleteMessage(message: DMMessage) {
    setContextMessage(null);
    if (!profile?.id || !threadId) return;
    let attempt: DmMessageMutationAttempt;
    try {
      attempt = messageMutations.prepare(
        { accountId: profile.id, threadId, messageId: message.id },
        { kind: "delete" },
      );
      const data = await messageMutations.run(
        attempt.scope,
        attempt.mutation,
        mutatePreparedNativeDmMessage,
      );
      if (!messageMutations.isGenerationCurrent(attempt)) return;
      updateCachedMessage(queryClient, threadId, data.message);
    } catch (error) {
      const current = messageMutations.peek();
      if (!current || current.scope.messageId !== message.id) return;
      const retryAttempt = current;
      Alert.alert(
        "Delete failed",
        error instanceof Error ? error.message : "Try again.",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              if (!messageMutations.isGenerationCurrent(retryAttempt)) return;
              messageMutations.cancel();
            },
          },
          {
            text: "Retry",
            onPress: () => {
              if (!messageMutations.isGenerationCurrent(retryAttempt)) return;
              void deleteMessage(message);
            },
          },
        ],
      );
    }
  }

  const beginReply = useCallback((message: DMMessage) => {
    if (message.is_deleted || isReadOnly) return;
    if (!sendAttempts.cancel()) return;
    setHasPendingImage(false);
    setReplyingTo(message);
    setEditingMessage(null);
    setEditError(null);
    setDraft(threadId, "");
  }, [isReadOnly, sendAttempts, setDraft, threadId]);

  function beginEdit(message: DMMessage) {
    if (!sendAttempts.cancel()) return;
    if (!messageMutations.cancel()) return;
    setHasPendingImage(false);
    setContextMessage(null);
    setEditingMessage(message);
    setReplyingTo(null);
    setEditError(null);
    setDraft(threadId, message.content ?? "");
  }

  const openContextMenu = useCallback((message: DMMessage) => {
    setContextCanEdit(
      message.sender_id === profile?.id &&
      // This is intentionally evaluated at the long-press event, not during render.
      Date.now() - new Date(message.created_at).getTime() < EDIT_WINDOW_MINUTES * 60_000,
    );
    setContextMessage(message);
  }, [profile?.id]);

  const handleLongPress = useCallback((message: DMMessage) => {
    if (!message.is_deleted) openContextMenu(message);
  }, [openContextMenu]);

  const handlePressReply = useCallback((message: DMMessage) => {
    const replyIndex = storedMessages.findIndex((item) => item.id === message.reply_to?.id);
    if (replyIndex >= 0) listRef.current?.scrollToIndex({ index: replyIndex, animated: true, viewPosition: 0.5 });
  }, [storedMessages]);

  const renderMessage = useCallback(({ item, index }: { item: DMMessage; index: number }) => (
    <MessageBubble
      message={item}
      previous={storedMessages[index - 1]}
      isOwn={item.sender_id === profile?.id}
      canReply={!isReadOnly}
      replyAuthor={getReplyAuthor(item, storedMessages, profile?.id ?? "", other ?? null)}
      onReply={beginReply}
      onLongPress={handleLongPress}
      onPressReply={handlePressReply}
    />
  ), [beginReply, handleLongPress, handlePressReply, isReadOnly, other, profile?.id, storedMessages]);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    setShowScrollButton(contentSize.height - contentOffset.y - layoutMeasurement.height > 100);
    if (
      contentOffset.y < 80 &&
      conversationQuery.hasNextPage &&
      !conversationQuery.isFetchingNextPage
    ) {
      loadingOlderRef.current = true;
      void conversationQuery.fetchNextPage().then((result) => {
        if (result.isError) loadingOlderRef.current = false;
      });
    }
    if (contextMessage) setContextMessage(null);
  }

  if (conversationQuery.isLoading && !thread) {
    return (
      <SafeAreaView edges={["top"]} style={styles.root}>
        <ChatHeaderSkeleton />
        <View style={styles.messageSkeletons}>
          {[0, 1, 2, 3, 4].map((item) => (
            <Skeleton key={item} style={[styles.messageSkeleton, item % 2 === 0 ? styles.skeletonOwn : styles.skeletonOther]} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  const subtitle = isReadOnly
    ? "Account deleted"
    : isPeerTyping
    ? "Typing…"
    : isOtherOnline
    ? "Online now"
    : other ? `@${other.username}` : "Loading";
  const replyAuthor = replyingTo
    ? replyingTo.sender_id === profile?.id ? "Yourself" : displayName(other)
    : "";

  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <IconButton icon="back" label="Back" size={36} onPress={() => router.push("/(app)/inbox" as never)} />
          {other ? <Avatar name={displayName(other)} uri={other.avatar_url} size={40} online={isOtherOnline} /> : null}
          <View style={styles.headerText}>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName} numberOfLines={1}>{other ? displayName(other) : "Chat"}</Text>
              {other && isPremium(other) ? <PremiumBadge /> : null}
            </View>
            <Caption style={isOtherOnline || isPeerTyping ? styles.headerOnline : undefined}>{subtitle}</Caption>
          </View>
          {!isReadOnly ? (
            <IconButton
              icon="video"
              iconSize={18}
              label="Start video call"
              size={36}
              onPress={() => {
                if (!profile?.id || !other) return;
                useCallStore.getState().startOutgoingCall(profile.id, threadId, Crypto.randomUUID(), {
                  id: other.id,
                  display_name: other.display_name,
                  username: other.username,
                  avatar_url: other.avatar_url,
                });
              }}
            />
          ) : null}
        </View>

        {readReceipt.error ? (
          <ReadReceiptRecovery pending={readReceipt.isPending} onRetry={readReceipt.retry} />
        ) : null}

        {!isReadOnly && other ? (
          <ChatApproximateProximityHint
            key={other.id}
            name={displayName(other)}
            onPlanAgain={() => setPlanComposerOpen(true)}
            visible={isInSameApproximateArea}
          />
        ) : null}

        {!isReadOnly && profile && other ? <View style={styles.meetupAction}><ChatMeetupAcknowledgement accountId={profile.id} peerId={other.id} threadId={threadId} onPlanAgain={() => setPlanComposerOpen(true)} /></View> : null}

        <View style={styles.messageListWrap}>
          <FlatList
            ref={listRef}
            data={storedMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messages}
            ListHeaderComponent={conversationQuery.isFetchingNextPage
              ? <ActivityIndicator color={colors.primary[500]} size="small" />
              : null}
            ListEmptyComponent={
              <View style={styles.emptyConversation}>
                {conversationQuery.isPending ? (
                  <ActivityIndicator accessibilityLabel="Loading conversation" color={colors.primary[500]} />
                ) : conversationQuery.isError ? (
                  <>
                    <Text style={styles.emptyTitle}>Couldn’t load this conversation</Text>
                    <Body style={styles.emptyBody}>Check your connection and try again.</Body>
                    <Pressable accessibilityRole="button" disabled={conversationQuery.isFetching} onPress={() => void conversationQuery.refetch()} style={styles.emptyRetry}>
                      <Text style={styles.emptyRetryText}>{conversationQuery.isFetching ? "Loading…" : "Try again"}</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.emptyTitle}>{isReadOnly ? "No messages yet" : "Start with a hello"}</Text>
                    <Body style={styles.emptyBody}>{isReadOnly ? "There are no messages in this conversation." : "Say what you’re up for and find a time that works for you both."}</Body>
                  </>
                )}
              </View>
            }
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onContentSizeChange={() => {
              if (loadingOlderRef.current) {
                loadingOlderRef.current = false;
                return;
              }
              if (!showScrollButton) listRef.current?.scrollToEnd({ animated: true });
            }}
            onScroll={handleScroll}
            scrollEventThrottle={80}
            showsVerticalScrollIndicator={false}
          />
          {showScrollButton ? (
            <IconButton
              icon="chevron-down"
              iconSize={18}
              label="Scroll to bottom"
              onPress={() => listRef.current?.scrollToEnd({ animated: true })}
              size={36}
              style={styles.scrollButton}
            />
          ) : null}
        </View>

        {isReadOnly && !editingMessage ? (
          <View style={[styles.readOnlyNotice, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
            <Caption style={styles.readOnlyText}>This account was deleted. The conversation history is read-only.</Caption>
          </View>
        ) : (
          <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
            <ChatMomentumActions
              hasMessages={storedMessages.length > 0}
              isError={suggestionsQuery.isError}
              isLoading={suggestionsQuery.isPending}
              onChooseReply={(reply) =>
                setDraft(threadId, appendEditableChatSuggestion(draft, reply))
              }
              onMakePlan={() => setPlanComposerOpen(true)}
              suggestions={suggestionsQuery.data?.suggestions}
            />
            {venuesQuery.data?.venues.length ? <View style={styles.venueCards}>{venuesQuery.data.venues.map((venue: VenueCard) => <View key={venue.id} style={styles.venueCard}><Text style={styles.venueName}>{venue.name}</Text>{venue.address ? <Caption>{venue.address}</Caption> : null}<View style={styles.venueActions}><Pressable accessibilityRole="button" onPress={() => setDraft(threadId, appendEditableChatSuggestion(draft, `How about ${venue.name}?`))}><Text style={styles.venueAction}>Suggest place</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { setPlanPlacePrefill(venue.name); setPlanComposerOpen(true); }}><Text style={styles.venueAction}>Meet here</Text></Pressable></View></View>)}</View> : venuesQuery.data?.source === "unavailable" ? <Caption>Venue suggestions are unavailable right now.</Caption> : null}
            {replyingTo ? (
              <ComposerNotice
                icon={<CornerUpLeft color={colors.accent[500]} size={14} />}
                onClose={() => {
                  if (!sendAttempts.cancel()) return;
                  setHasPendingImage(false);
                  setReplyingTo(null);
                }}
              >
                <Text numberOfLines={1} style={styles.noticeTitle}>{replyAuthor}</Text>
                <Caption numberOfLines={1}>{replyingTo.content || "Message deleted"}</Caption>
              </ComposerNotice>
            ) : null}
            {hasPendingImage && !editingMessage ? (
              <ComposerNotice icon={<ImageIcon color={colors.accent[500]} size={14} />} onClose={discardPendingImage}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry sending photo"
                  onPress={() => void retryPendingImage()}
                >
                  <Text numberOfLines={1} style={styles.noticeEdit}>Photo ready · Tap to retry</Text>
                  <Caption numberOfLines={1}>No upload will be repeated</Caption>
                </Pressable>
              </ComposerNotice>
            ) : null}
            {editingMessage ? (
              <ComposerNotice
                icon={<Pencil color={colors.accent[500]} size={14} />}
                onClose={() => {
                  if (!messageMutations.cancel()) return;
                  setEditingMessage(null);
                  setEditError(null);
                  setDraft(threadId, "");
                }}
              >
                <Text
                  accessibilityLiveRegion="polite"
                  numberOfLines={2}
                  style={styles.noticeEdit}
                >
                  {editError ? `${editError} Tap Save edit to retry.` : "Editing message"}
                </Text>
              </ComposerNotice>
            ) : null}
            <View style={styles.composer}>
              {!editingMessage ? (
                <IconButton
                  icon="image"
                  label="Send a photo"
                  disabled={sending}
                  size={36}
                  variant="ghost"
                  onPress={sendImage}
                />
              ) : null}
              <TextInput
                value={draft}
                editable={!sending}
                onChangeText={(value) => {
                  const pending = sendAttempts.peek();
                  if (pending?.draft.mediaUrl) {
                    if (sendAttempts.cancel()) setHasPendingImage(false);
                  } else if (pending) {
                    const nextDraft = { content: value, replyToId: replyingTo?.id };
                    if (!value.trim() || !sendAttempts.matches(nextDraft)) sendAttempts.cancel();
                  }
                  setDraft(threadId, value);
                  if (value.trim() && !editingMessage) notifyTyping();
                }}
                placeholder={editingMessage ? "Edit message..." : "Message..."}
                placeholderTextColor={colors.ink[5]}
                style={styles.composerInput}
                returnKeyType="send"
                onSubmitEditing={() => void submit()}
              />
              <IconButton
                icon="send"
                iconSize={18}
                label={editingMessage ? "Save edit" : "Send message"}
                loading={sending}
                onPress={() => void submit()}
                disabled={!draft.trim() || sending}
                size={36}
                style={(!draft.trim() || sending) ? styles.sendButtonHidden : undefined}
                variant="primary"
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <MessageContextMenu
        message={contextMessage}
        isOwn={contextMessage?.sender_id === profile?.id}
        canEdit={contextCanEdit}
        onClose={() => setContextMessage(null)}
        onEdit={() => contextMessage && beginEdit(contextMessage)}
        onCopy={() => {
          if (contextMessage?.content) void Clipboard.setStringAsync(contextMessage.content);
          setContextMessage(null);
        }}
        onDelete={() => contextMessage && void deleteMessage(contextMessage)}
      />
      <PlanComposer open={planComposerOpen} onClose={() => setPlanComposerOpen(false)} sourceThreadId={threadId} initialPlaceText={planPlacePrefill} onCreated={(planId) => router.push(`/plans/${planId}` as never)} />
      </SafeAreaView>
  );
}

function appendCachedMessage(queryClient: ReturnType<typeof useQueryClient>, threadId: string, message: DMMessage) {
  let inserted = false;
  queryClient.setQueryData<InfiniteData<MessagesData>>(nativeQueryKeys.chat.messages(threadId), (current) => {
    if (!current || current.pages.some((page) => page.messages.some((item) => item.id === message.id))) return current;
    inserted = true;
    const pages = current.pages.map((page, index) => index === 0
      ? { ...page, messages: [...page.messages, message] }
      : page);
    return { ...current, pages };
  });
  if (inserted) void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.inbox.threads });
}

function updateCachedMessage(queryClient: ReturnType<typeof useQueryClient>, threadId: string, message: DMMessage) {
  queryClient.setQueryData<InfiniteData<MessagesData>>(nativeQueryKeys.chat.messages(threadId), (current) => {
    if (!current) return current;
    return {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        messages: page.messages.map((item) => item.id === message.id ? message : item),
      })),
    };
  });
  void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.inbox.threads });
}

function getReplyAuthor(
  message: DMMessage,
  messages: DMMessage[],
  userId: string,
  other: { display_name?: string | null; username?: string | null } | null,
) {
  const senderId = message.reply_to?.sender_id;
  if (!senderId) return "";
  if (senderId === userId) return "You";
  const sender = messages.find((item) => item.sender_id === senderId && item.sender)?.sender;
  return displayName(sender ?? other);
}

function MessageBubble({
  message,
  previous,
  isOwn,
  canReply,
  replyAuthor,
  onReply,
  onLongPress,
  onPressReply,
}: {
  message: DMMessage;
  previous?: DMMessage;
  isOwn: boolean;
  canReply: boolean;
  replyAuthor: string;
  onReply: (message: DMMessage) => void;
  onLongPress: (message: DMMessage) => void;
  onPressReply: (message: DMMessage) => void;
}) {
  const [translateX] = useState(() => new Animated.Value(0));
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      canReply && !message.is_deleted && gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 0.7,
    onPanResponderMove: (_event, gesture) => translateX.setValue(Math.max(gesture.dx, -64)),
    onPanResponderRelease: (_event, gesture) => {
      if (canReply && gesture.dx < -50 && Math.abs(gesture.dx) > Math.abs(gesture.dy)) onReply(message);
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 0 }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 0 }).start();
    },
  }), [canReply, message, onReply, translateX]);
  const grouped = previous?.sender_id === message.sender_id &&
    new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 60_000;

  return (
    <View style={[styles.messageRow, isOwn ? styles.messageRowOwn : styles.messageRowOther, { marginTop: grouped ? 2 : 12 }]}>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <Pressable
          delayLongPress={500}
          onLongPress={() => onLongPress(message)}
          style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}
        >
          {message.reply_to && !message.is_deleted ? (
            <Pressable
              onPress={() => onPressReply(message)}
              style={[styles.replySnippet, isOwn ? styles.replySnippetOwn : styles.replySnippetOther]}
            >
              <Text numberOfLines={1} style={[styles.replyAuthor, isOwn && styles.ownText]}>{replyAuthor}</Text>
              <Text numberOfLines={1} style={[styles.replyContent, isOwn && styles.ownReplyContent]}>
                {message.reply_to.content || "Message deleted"}
              </Text>
            </Pressable>
          ) : null}
          {message.is_deleted ? (
            <Text style={[styles.deletedText, isOwn ? styles.ownText : styles.otherText]}>This message was deleted</Text>
          ) : (
            <>
              {message.media_url ? <Image source={{ uri: message.media_url }} style={styles.messageImage} /> : null}
              <Body style={isOwn ? styles.ownText : styles.otherText}>{message.content}</Body>
            </>
          )}
          {message.is_edited && !message.is_deleted ? (
            <Caption style={isOwn ? styles.editedOwn : styles.editedOther}>(edited)</Caption>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function ComposerNotice({ icon, children, onClose }: { icon: ReactNode; children: ReactNode; onClose: () => void }) {
  return (
    <View style={styles.notice}>
      {icon}
      <View style={styles.noticeContent}>{children}</View>
      <IconButton icon="close" iconColor={colors.ink[5]} iconSize={14} label="Cancel" onPress={onClose} size={20} variant="ghost" />
    </View>
  );
}

function MessageContextMenu({
  message,
  isOwn,
  canEdit,
  onClose,
  onEdit,
  onCopy,
  onDelete,
}: {
  message: DMMessage | null;
  isOwn: boolean;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal transparent animationType="fade" visible={!!message} onRequestClose={onClose}>
      <Pressable style={styles.contextBackdrop} onPress={onClose}>
        <Pressable style={styles.contextContent} onPress={(event) => event.stopPropagation()}>
          {message ? (
            <View style={[styles.contextGhost, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
              <Body style={isOwn ? styles.ownText : styles.otherText}>{message.content}</Body>
              {message.is_edited ? <Caption style={isOwn ? styles.editedOwn : styles.editedOther}>(edited)</Caption> : null}
            </View>
          ) : null}
          <View style={styles.contextMenu}>
            {canEdit ? <ContextAction icon={<Pencil color={colors.ink[8]} size={18} />} label="Edit" onPress={onEdit} /> : null}
            <ContextAction icon={<Copy color={colors.ink[8]} size={18} />} label="Copy" onPress={onCopy} />
            {isOwn ? <ContextAction danger icon={<Trash2 color={colors.danger[500]} size={18} />} label="Delete" onPress={onDelete} /> : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ContextAction({ icon, label, danger = false, onPress }: { icon: ReactNode; label: string; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.contextAction, pressed && styles.contextActionPressed]}>
      {icon}
      <Text style={[styles.contextActionText, danger && styles.contextDanger]}>{label}</Text>
    </Pressable>
  );
}

function ChatHeaderSkeleton() {
  return (
    <View style={styles.header}>
      <Skeleton style={styles.skeletonBack} />
      <Skeleton style={styles.skeletonAvatar} />
      <View style={styles.skeletonHeaderText}>
        <Skeleton style={styles.skeletonName} />
        <Skeleton style={styles.skeletonSubtitle} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  keyboard: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerName: { ...typography.bodyBold, color: colors.ink[9], flexShrink: 1 },
  headerOnline: { color: colors.success[600] },
  messageListWrap: { flex: 1, position: "relative" },
  messages: { flexGrow: 1, paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[4] },
  emptyConversation: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing[5], paddingVertical: spacing[6], gap: spacing[2] },
  emptyTitle: { ...typography.bodyBold, color: colors.ink[9], textAlign: "center" },
  emptyBody: { color: colors.ink[6], textAlign: "center", maxWidth: 280 },
  emptyRetry: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing[4], marginTop: spacing[2] },
  emptyRetryText: { ...typography.bodyBold, color: colors.primary[600] },
  messageRow: { flexDirection: "row" },
  messageRowOwn: { justifyContent: "flex-end" },
  messageRowOther: { justifyContent: "flex-start" },
  bubble: { maxWidth: "75%", paddingHorizontal: spacing[4], paddingVertical: 10, overflow: "hidden" },
  bubbleOwn: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: 4,
    backgroundColor: colors.primary[500],
  },
  bubbleOther: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
    borderBottomLeftRadius: 4,
    backgroundColor: colors.surface,
    ...shadows.e0,
  },
  ownText: { color: colors.surface },
  otherText: { color: colors.ink[8] },
  deletedText: { ...typography.body, fontStyle: "italic", opacity: 0.6 },
  editedOwn: { color: "rgba(255,255,255,0.72)", marginTop: spacing[1] },
  editedOther: { marginTop: spacing[1] },
  messageImage: { width: 210, height: 160, borderRadius: radii.sm, marginBottom: spacing[2] },
  replySnippet: { marginBottom: 6, borderLeftWidth: 2, borderLeftColor: colors.ink[8], borderRadius: 6, paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  replySnippetOwn: { backgroundColor: colors.primary[600], borderLeftColor: colors.surface },
  replySnippetOther: { backgroundColor: colors.surfaceAlt },
  replyAuthor: { fontFamily: fontFamilies.semibold, fontSize: 12, lineHeight: 15, color: colors.ink[8], opacity: 0.9 },
  replyContent: { fontFamily: fontFamilies.regular, fontSize: 12, lineHeight: 15, color: colors.ink[8], opacity: 0.7 },
  ownReplyContent: { color: colors.surface },
  scrollButton: {
    position: "absolute",
    right: spacing[4],
    bottom: spacing[3],
  },
  composerWrap: { paddingHorizontal: spacing[4], paddingTop: spacing[2], backgroundColor: colors.background },
  meetupAction: { paddingHorizontal: spacing[4], paddingTop: spacing[2], backgroundColor: colors.background },
  readOnlyNotice: { paddingHorizontal: spacing[4], paddingTop: spacing[4], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline, backgroundColor: colors.surface },
  readOnlyText: { color: colors.ink[5], textAlign: "center" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: spacing[2], marginBottom: spacing[2], paddingHorizontal: spacing[1] },
  noticeContent: { flex: 1, minWidth: 0 },
  noticeTitle: { fontFamily: fontFamilies.semibold, fontSize: 12, lineHeight: 15, color: colors.accent[500] },
  noticeEdit: { fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 16, color: colors.accent[500] },
  venueCards: { gap: spacing[2], marginBottom: spacing[2] },
  venueCard: { gap: spacing[1], padding: spacing[3], borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, backgroundColor: colors.surface },
  venueName: { ...typography.body, fontFamily: fontFamilies.semibold, color: colors.ink[8] },
  venueActions: { flexDirection: "row", gap: spacing[3] },
  venueAction: { ...typography.caption, fontFamily: fontFamilies.semibold, color: colors.primary[500] },
  composer: {
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    paddingLeft: spacing[3],
    paddingRight: 6,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: colors.ink[1],
  },
  composerInput: { flex: 1, minHeight: 34, color: colors.ink[8], ...typography.body },
  sendButtonHidden: { opacity: 0, transform: [{ translateY: 8 }] },
  contextBackdrop: { flex: 1, padding: spacing[4], alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)" },
  contextContent: { width: "100%", maxWidth: 420, gap: spacing[2] },
  contextGhost: { maxWidth: "75%", paddingHorizontal: spacing[4], paddingVertical: 10, alignSelf: "center" },
  contextMenu: { minWidth: 180, alignSelf: "center", borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, overflow: "hidden", backgroundColor: colors.surface, ...shadows.e2 },
  contextAction: { minHeight: 48, paddingHorizontal: spacing[4], flexDirection: "row", alignItems: "center", gap: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  contextActionPressed: { backgroundColor: colors.ink[1] },
  contextActionText: { ...typography.body, color: colors.ink[8] },
  contextDanger: { color: colors.danger[500] },
  messageSkeletons: { flex: 1, padding: spacing[4], gap: spacing[3] },
  messageSkeleton: { height: 64, borderRadius: radii.lg },
  skeletonOwn: { width: 192, alignSelf: "flex-end" },
  skeletonOther: { width: 224, alignSelf: "flex-start" },
  skeletonBack: { width: 36, height: 36, borderRadius: 18 },
  skeletonAvatar: { width: 40, height: 40, borderRadius: 20 },
  skeletonHeaderText: { flex: 1, gap: spacing[2] },
  skeletonName: { width: 96, height: 16 },
  skeletonSubtitle: { width: 64, height: 12 },
});
