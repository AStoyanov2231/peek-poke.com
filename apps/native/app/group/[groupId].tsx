import { router, useLocalSearchParams, type ErrorBoundaryProps } from "expo-router";
import * as Crypto from "expo-crypto";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View, type ListRenderItemInfo } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Users } from "lucide-react-native";
import {
  createChatMessageAttemptCoordinator,
  mergeNewestFirstMessagePages,
  type Message,
  type SharedGroupMessagesResponse,
} from "@peekpoke/shared";
import { colors, radii, shadows, spacing, typography } from "@peekpoke/design";
import { Avatar, Caption, IconButton, Skeleton } from "@/components/ui";
import { ErrorRecovery, RouteErrorRecovery } from "@/components/error-recovery";
import { fetchCurrentProfile } from "@/data/api";
import { fetchSharedGroupMessages, markSharedGroupRead, sendSharedGroupMessage } from "@/data/shared-groups";
import { nativeQueryKeys } from "@/data/query-keys";
import { useAppStore } from "@/state/app-store";

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorRecovery {...props} title="Couldn’t load shared group" />;
}

export default function SharedGroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const profileQuery = useQuery({ queryKey: nativeQueryKeys.profile.current, queryFn: fetchCurrentProfile });
  const conversationQuery = useInfiniteQuery({
    queryKey: nativeQueryKeys.chat.groupMessages(groupId),
    queryFn: ({ pageParam, signal }) => fetchSharedGroupMessages(groupId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pagination.has_more
      ? lastPage.pagination.next_cursor ?? undefined
      : undefined,
    enabled: Boolean(groupId),
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const profile = profileQuery.data;
  const group = conversationQuery.data?.pages[0]?.group ?? null;
  const messages = useMemo(
    () => conversationQuery.data
      ? mergeNewestFirstMessagePages(conversationQuery.data.pages) as Message[]
      : [],
    [conversationQuery.data],
  );
  const listRef = useRef<FlatList<Message>>(null);
  const loadingOlderRef = useRef(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [readError, setReadError] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const [sendAttempts] = useState(() => createChatMessageAttemptCoordinator(() => Crypto.randomUUID()));
  const renderGroupMessage = useCallback(({ item, index }: ListRenderItemInfo<Message>) => (
    <GroupMessage message={item} previous={messages[index - 1]} own={item.sender_id === profile?.id} />
  ), [messages, profile?.id]);

  useEffect(() => {
    if (!groupId) return;
    useAppStore.getState().setActiveThreadId(null);
    useAppStore.getState().setActiveGroupId(groupId);
    return () => {
      if (useAppStore.getState().activeGroupId === groupId) {
        useAppStore.getState().setActiveGroupId(null);
      }
      sendAttempts.reset();
    };
  }, [groupId, sendAttempts]);

  useEffect(() => {
    if (!group || !profile?.id) return;
    const controller = new AbortController();
    void markSharedGroupRead(groupId, controller.signal)
      .then(() => {
        setReadError(false);
        return queryClient.invalidateQueries({ queryKey: nativeQueryKeys.inbox.groups });
      })
      .catch(() => {
        if (!controller.signal.aborted) setReadError(true);
      });
    return () => controller.abort();
  }, [group, groupId, profile?.id, queryClient, readAttempt]);

  const appendMessage = useCallback((message: Message) => {
    let inserted = false;
    queryClient.setQueryData<InfiniteData<SharedGroupMessagesResponse>>(
      nativeQueryKeys.chat.groupMessages(groupId),
      (current) => {
        if (!current || current.pages.some((page) => page.messages.some((item) => item.id === message.id))) return current;
        inserted = true;
        return {
          ...current,
          pages: current.pages.map((page, index) => index === 0
            ? { ...page, messages: [...page.messages, message] }
            : page),
        };
      },
    );
    if (inserted) void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.inbox.groups });
  }, [groupId, queryClient]);

  async function submit() {
    const content = draft.trim();
    if (!content || sending || !groupId) return;
    let attempt = sendAttempts.peek();
    if (!attempt) {
      try {
        attempt = sendAttempts.prepare({ content });
      } catch (error) {
        setSendError(error instanceof Error ? error.message : "Could not send message.");
        return;
      }
    }
    setSending(true);
    setSendError(null);
    try {
      const response = await sendAttempts.run(attempt.draft, (pendingAttempt) =>
        sendSharedGroupMessage(groupId, {
          client_id: pendingAttempt.clientId,
          content: pendingAttempt.payload.content,
        }),
      );
      appendMessage(response.message);
      sendAttempts.cancel();
      setDraft("");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  if (conversationQuery.isError) {
    return (
      <View style={styles.centered}>
        <ErrorRecovery
          error={conversationQuery.error instanceof Error ? conversationQuery.error : new Error("Group load failed")}
          fill={false}
          onRetry={() => void conversationQuery.refetch()}
          title="Couldn’t load shared group"
        />
      </View>
    );
  }

  if (conversationQuery.isLoading || !group) {
    return (
      <View style={styles.root}>
        <View style={styles.header}><Skeleton style={styles.backSkeleton} /><Skeleton style={styles.avatarSkeleton} /><View style={styles.headerSkeletonText}><Skeleton style={styles.nameSkeleton} /><Skeleton style={styles.subtitleSkeleton} /></View></View>
        <View style={styles.loadingMessages}><Skeleton style={styles.messageSkeleton} /><Skeleton style={[styles.messageSkeleton, styles.messageSkeletonOwn]} /><Skeleton style={styles.messageSkeleton} /></View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <View style={[styles.header, { paddingTop: spacing[3] + insets.top }]}>
          <IconButton icon="back" label="Back to inbox" size={40} onPress={() => router.push("/(app)/inbox" as never)} />
          <View style={styles.groupIcon}><Users color={colors.primary[700]} size={21} strokeWidth={2} /></View>
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={styles.headerName}>{group.name}</Text>
            <Caption numberOfLines={1}>{group.member_count} {group.member_count === 1 ? "member" : "members"} · anyone with the same code can join</Caption>
          </View>
        </View>

        {readError ? (
          <View accessibilityRole="alert" style={styles.recoveryBanner}>
            <Caption style={styles.recoveryText}>Unread status could not sync.</Caption>
            <IconButton icon="recenter" label="Retry unread status" size={36} variant="ghost" onPress={() => setReadAttempt((current) => current + 1)} />
          </View>
        ) : null}

        <View style={styles.messageListWrap}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderGroupMessage}
            contentContainerStyle={styles.messages}
            ListHeaderComponent={conversationQuery.isFetchingNextPage ? <ActivityIndicator color={colors.primary[500]} size="small" /> : null}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onContentSizeChange={() => {
              if (loadingOlderRef.current) {
                loadingOlderRef.current = false;
                return;
              }
              listRef.current?.scrollToEnd({ animated: false });
            }}
            onScroll={(event) => {
              if (event.nativeEvent.contentOffset.y < 80 && conversationQuery.hasNextPage && !conversationQuery.isFetchingNextPage) {
                loadingOlderRef.current = true;
                void conversationQuery.fetchNextPage();
              }
            }}
            scrollEventThrottle={80}
            showsVerticalScrollIndicator={false}
          />
        </View>

        {sendError && sendAttempts.peek() ? (
          <View accessibilityRole="alert" style={styles.sendRecovery}>
            <Caption style={styles.recoveryText}>{sendError} Your message is saved for retry.</Caption>
            <IconButton icon="send" label="Retry sending message" size={36} variant="ghost" onPress={() => void submit()} />
          </View>
        ) : null}
        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
          <TextInput
            editable={!sending}
            onChangeText={(value) => {
              if (sendAttempts.peek() && (!value.trim() || !sendAttempts.matches({ content: value }))) sendAttempts.cancel();
              setDraft(value);
              setSendError(null);
            }}
            onSubmitEditing={() => void submit()}
            placeholder="Message..."
            placeholderTextColor={colors.ink[5]}
            returnKeyType="send"
            style={styles.input}
            value={draft}
          />
          <IconButton
            disabled={!draft.trim() || sending}
            icon="send"
            label="Send message"
            loading={sending}
            size={40}
            variant="primary"
            onPress={() => void submit()}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function GroupMessage({ message, previous, own }: { message: Message; previous?: Message; own: boolean }) {
  const grouped = previous?.sender_id === message.sender_id
    && new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 60_000;
  const senderName = own ? "You" : message.sender?.display_name || message.sender?.username || "Member";
  return (
    <View style={[styles.messageRow, own ? styles.messageRowOwn : styles.messageRowOther, { marginTop: grouped ? 2 : 12 }]}>
      {!own && !grouped ? <Avatar name={senderName} uri={message.sender?.avatar_url} size={28} /> : !own ? <View style={styles.avatarSpacer} /> : null}
      <View style={[styles.messageColumn, own ? styles.messageColumnOwn : undefined]}>
        {!own && !grouped ? <Text style={styles.senderName}>{senderName}</Text> : null}
        <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>
          <Text style={own ? styles.ownText : styles.otherText}>{message.content}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  keyboard: { flex: 1 },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing[4] },
  header: { flexDirection: "row", alignItems: "center", gap: spacing[3], paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline, backgroundColor: colors.surface },
  groupIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary[100] },
  headerText: { flex: 1, minWidth: 0 },
  headerName: { ...typography.bodyBold, color: colors.ink[9] },
  messageListWrap: { flex: 1, position: "relative" },
  messages: { flexGrow: 1, paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[4] },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing[2] },
  messageRowOwn: { justifyContent: "flex-end" },
  messageRowOther: { justifyContent: "flex-start" },
  messageColumn: { maxWidth: "78%", gap: 2 },
  messageColumnOwn: { alignItems: "flex-end" },
  avatarSpacer: { width: 28 },
  senderName: { ...typography.caption, color: colors.ink[5], marginLeft: spacing[1] },
  bubble: { paddingHorizontal: spacing[4], paddingVertical: 10, borderRadius: radii.lg, overflow: "hidden" },
  bubbleOwn: { borderBottomRightRadius: 4, backgroundColor: colors.primary[500] },
  bubbleOther: { borderBottomLeftRadius: 4, backgroundColor: colors.surface, ...shadows.e0 },
  ownText: { ...typography.body, color: colors.surface },
  otherText: { ...typography.body, color: colors.ink[8] },
  composerWrap: { flexDirection: "row", alignItems: "center", gap: spacing[2], paddingHorizontal: spacing[4], paddingTop: spacing[2], backgroundColor: colors.background },
  input: { flex: 1, minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, borderRadius: radii.pill, paddingHorizontal: spacing[4], color: colors.ink[8], backgroundColor: colors.ink[1], ...typography.body },
  recoveryBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[4], paddingVertical: spacing[1], backgroundColor: "#fff0ef" },
  sendRecovery: { flexDirection: "row", alignItems: "center", gap: spacing[2], paddingHorizontal: spacing[4], paddingVertical: spacing[1], backgroundColor: "#fff0ef" },
  recoveryText: { flex: 1, color: colors.danger[500] },
  loadingMessages: { flex: 1, gap: spacing[3], padding: spacing[4] },
  messageSkeleton: { width: 220, height: 60, borderRadius: radii.lg },
  messageSkeletonOwn: { alignSelf: "flex-end", width: 180 },
  backSkeleton: { width: 40, height: 40, borderRadius: 20 },
  avatarSkeleton: { width: 40, height: 40, borderRadius: 20 },
  headerSkeletonText: { flex: 1, gap: spacing[2] },
  nameSkeleton: { width: 108, height: 16 },
  subtitleSkeleton: { width: 210, height: 12 },
});
