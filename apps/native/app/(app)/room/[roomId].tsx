import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import Send from "lucide-react-native/icons/send";
import Users from "lucide-react-native/icons/users";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createChatMessageAttemptCoordinator, mergeNewestFirstMessagePages, roomMessageHintSchema, type RoomMessage, type RoomMessagesResponse } from "@peekpoke/shared";
import { colors, spacing } from "@peekpoke/design";
import { Avatar, Caption, Muted } from "@/components/ui";
import { fetchRoomMessages, sendRoomMessage } from "@/data/rooms";
import { fetchCurrentProfile } from "@/data/api";
import { nativeQueryKeys } from "@/data/query-keys";
import { supabase } from "@/lib/supabase";

export default function RoomChatScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<RoomMessage>>(null);
  const initialScrollDoneRef = useRef(false);
  const scrollToEndOnContentChangeRef = useRef(false);
  const preserveScrollOnPrependRef = useRef(false);
  const contentHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const olderPageLoadingRef = useRef(false);
  const userScrollActiveRef = useRef(false);
  const momentumScrollActiveRef = useRef(false);
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendAttempts] = useState(() => createChatMessageAttemptCoordinator(() => randomUUID()));
  const profileQuery = useQuery({
    queryKey: nativeQueryKeys.profile.current,
    queryFn: fetchCurrentProfile,
  });
  const profile = profileQuery.data;
  const conversationQuery = useInfiniteQuery({
    queryKey: nativeQueryKeys.rooms.messages(roomId ?? ""),
    queryFn: ({ pageParam, signal }) => fetchRoomMessages(roomId ?? "", pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pagination.has_more
      ? lastPage.pagination.next_cursor ?? undefined
      : undefined,
    enabled: Boolean(roomId),
    refetchOnReconnect: false,
  });
  const room = conversationQuery.data?.pages[0]?.room ?? null;
  const messages = useMemo(() => conversationQuery.data
    ? mergeNewestFirstMessagePages(conversationQuery.data.pages) as unknown as RoomMessage[]
    : [], [conversationQuery.data]);
  const initialRoomLoaded = conversationQuery.isSuccess && conversationQuery.data?.pages[0]?.room.id === roomId;

  const loadOlderPage = useCallback(() => {
    if (!conversationQuery.hasNextPage || conversationQuery.isFetchingNextPage || olderPageLoadingRef.current) return;
    olderPageLoadingRef.current = true;
    preserveScrollOnPrependRef.current = true;
    void conversationQuery.fetchNextPage().then(
      () => { olderPageLoadingRef.current = false; },
      () => {
        olderPageLoadingRef.current = false;
        preserveScrollOnPrependRef.current = false;
      },
    );
  }, [conversationQuery]);

  useEffect(() => () => sendAttempts.reset(), [roomId, sendAttempts]);

  useEffect(() => {
    if (!initialRoomLoaded) return;
    void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.rooms.list });
  }, [initialRoomLoaded, queryClient]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`room:${roomId}`, { config: { private: true } })
      .on("broadcast", { event: "messages-changed" }, (event) => {
        const parsed = roomMessageHintSchema.safeParse(event.payload);
        if (!parsed.success || parsed.data.room_id !== roomId) return;
        void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.rooms.messages(roomId) });
        void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.rooms.list });
      })
      .subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [queryClient, roomId]);

  const sendMutation = useMutation({
    mutationFn: (content: string) => sendAttempts.run(
      { content },
      (attempt) => sendRoomMessage(roomId ?? "", attempt.draft.content, attempt.clientId),
    ),
    onSuccess: ({ message }) => {
      setInput("");
      setSendError(null);
      scrollToEndOnContentChangeRef.current = true;
      queryClient.setQueryData<InfiniteData<RoomMessagesResponse>>(
        nativeQueryKeys.rooms.messages(roomId ?? ""),
        (current) => current
          ? { ...current, pages: current.pages.map((page, index) => index === 0 ? { ...page, messages: [...page.messages, message] } : page) }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.rooms.messages(roomId ?? "") });
      void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.rooms.list });
    },
    onError: (error) => setSendError(error instanceof Error ? error.message : "Message could not be sent."),
  });

  const submit = useCallback(() => {
    const content = input.trim();
    if (!content || sendMutation.isPending || !roomId) return;
    sendMutation.mutate(content);
  }, [input, roomId, sendMutation]);

  if (conversationQuery.isPending) return <View style={styles.center}><ActivityIndicator color={colors.primary[500]} /></View>;
  if (conversationQuery.isError || !room) {
    return <View style={styles.center}><Text style={styles.errorTitle}>Room unavailable</Text><Pressable onPress={() => void conversationQuery.refetch()}><Text style={styles.retry}>Try again</Text></Pressable></View>;
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to rooms" onPress={() => router.replace("/(app)/rooms" as never)} style={styles.back}><ArrowLeft color={colors.ink[9]} size={22} /></Pressable>
        <View style={styles.roomIcon}><Users color={colors.primary[500]} size={18} /></View>
        <View style={styles.headerCopy}><Text numberOfLines={1} style={styles.roomName}>{room.name}</Text><Caption>{room.member_count} {room.member_count === 1 ? "member" : "members"}</Caption></View>
      </View>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(message) => message.id}
        contentContainerStyle={styles.messages}
        onContentSizeChange={(_, height) => {
          const previousHeight = contentHeightRef.current;
          contentHeightRef.current = height;
          if (preserveScrollOnPrependRef.current) {
            preserveScrollOnPrependRef.current = false;
            const heightDelta = height - previousHeight;
            if (heightDelta > 0) {
              listRef.current?.scrollToOffset({ offset: Math.max(0, scrollOffsetRef.current + heightDelta), animated: false });
            }
            return;
          }
          if (initialRoomLoaded && (!initialScrollDoneRef.current || scrollToEndOnContentChangeRef.current)) {
            initialScrollDoneRef.current = true;
            scrollToEndOnContentChangeRef.current = false;
            listRef.current?.scrollToEnd({ animated: false });
          }
        }}
        onScroll={({ nativeEvent }) => {
          scrollOffsetRef.current = nativeEvent.contentOffset.y;
          if (userScrollActiveRef.current && initialScrollDoneRef.current && nativeEvent.contentOffset.y <= 24) loadOlderPage();
        }}
        onScrollBeginDrag={() => { userScrollActiveRef.current = true; }}
        onScrollEndDrag={() => {
          if (!momentumScrollActiveRef.current) userScrollActiveRef.current = false;
        }}
        onMomentumScrollBegin={() => {
          momentumScrollActiveRef.current = true;
          userScrollActiveRef.current = true;
        }}
        onMomentumScrollEnd={() => {
          momentumScrollActiveRef.current = false;
          userScrollActiveRef.current = false;
        }}
        scrollEventThrottle={16}
        renderItem={({ item }) => {
          const own = item.sender_id === profile?.id;
          const senderName = item.sender?.display_name || item.sender?.username || "Member";
          return <View style={[styles.messageRow, own && styles.messageRowOwn]}><Avatar name={senderName} uri={item.sender?.avatar_url} size={28} /><View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}><Text style={[styles.sender, own && styles.senderOwn]}>{own ? "You" : senderName}</Text><Text style={[styles.messageText, own && styles.messageTextOwn]}>{item.content}</Text></View></View>;
        }}
        ListEmptyComponent={<View style={styles.empty}><Muted>Be the first to say hello.</Muted></View>}
      />
      {sendError ? <Text accessibilityRole="alert" style={styles.sendError}>{sendError}</Text> : null}
      <View style={styles.composer}><TextInput value={input} onChangeText={setInput} onSubmitEditing={submit} returnKeyType="send" placeholder="Message the room…" placeholderTextColor={colors.ink[5]} style={styles.input} editable={!sendMutation.isPending} /><Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!input.trim() || sendMutation.isPending} onPress={submit} style={({ pressed }) => [styles.send, pressed && styles.sendPressed]}><Send color={input.trim() ? colors.primary.contrast : colors.ink[5]} size={18} /></Pressable></View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  center: { alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center", padding: spacing[5] },
  errorTitle: { color: colors.ink[9], fontSize: 18, fontWeight: "700" },
  retry: { color: colors.primary[600], fontSize: 15, fontWeight: "600", marginTop: spacing[3] },
  header: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.hairline, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing[2], paddingHorizontal: spacing[3], paddingTop: spacing[3], paddingBottom: spacing[3] },
  back: { alignItems: "center", height: 42, justifyContent: "center", width: 42 },
  roomIcon: { alignItems: "center", backgroundColor: colors.primary[50], borderRadius: 22, height: 40, justifyContent: "center", width: 40 },
  headerCopy: { flex: 1, gap: 1 },
  roomName: { color: colors.ink[9], fontSize: 16, fontWeight: "700" },
  messages: { gap: spacing[3], padding: spacing[4], paddingBottom: spacing[5] },
  messageRow: { alignItems: "flex-end", flexDirection: "row", gap: spacing[2], maxWidth: "88%" },
  messageRowOwn: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  bubble: { borderRadius: 16, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  bubbleOwn: { backgroundColor: colors.primary[500], borderBottomRightRadius: 5 },
  bubbleOther: { backgroundColor: colors.surface, borderBottomLeftRadius: 5, borderColor: colors.hairline, borderWidth: StyleSheet.hairlineWidth },
  sender: { color: colors.ink[6], fontSize: 11, fontWeight: "700", marginBottom: 2 },
  senderOwn: { color: "rgba(255,255,255,0.8)" },
  messageText: { color: colors.ink[9], fontSize: 15, lineHeight: 20 },
  messageTextOwn: { color: colors.primary.contrast },
  empty: { alignItems: "center", paddingTop: spacing[8] },
  sendError: { color: colors.danger[500], fontSize: 12, paddingHorizontal: spacing[4], textAlign: "center" },
  composer: { alignItems: "center", backgroundColor: colors.surface, borderTopColor: colors.hairline, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing[2], padding: spacing[3] },
  input: { backgroundColor: colors.ink[1], borderColor: colors.hairline, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, color: colors.ink[9], flex: 1, height: 44, paddingHorizontal: spacing[4] },
  send: { alignItems: "center", backgroundColor: colors.primary[500], borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  sendPressed: { opacity: 0.8 },
});
