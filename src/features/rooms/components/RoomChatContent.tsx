"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createChatMessageAttemptCoordinator, mergeNewestFirstMessagePages, roomMessageHintSchema, type RoomMessagesResponse } from "@peekpoke/shared";
import { createClient } from "@/lib/supabase/client";
import { roomMessagesQueryOptions, sendRoomMessage } from "@/data/rooms";
import { webQueryKeys } from "@/data/web-query";
import { useAuth } from "@/features/auth/useAuth";
import { ChatComposer } from "@/features/chat/components/ChatComposer";
import { ChatMessageList } from "@/features/chat/components/ChatMessageList";
import { RoomHeader } from "@/features/rooms/components/RoomHeader";
import { Skeleton } from "@/components/ui/skeleton";
import type { DMMessage } from "@/types/database";

const supabase = createClient();
const EMPTY_MESSAGES: DMMessage[] = [];

export function RoomChatContent({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery(roomMessagesQueryOptions(roomId));
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendAttempts] = useState(() => createChatMessageAttemptCoordinator(() => crypto.randomUUID()));
  const messages = useMemo(() => {
    if (!query.data) return EMPTY_MESSAGES;
    return mergeNewestFirstMessagePages(query.data.pages) as unknown as DMMessage[];
  }, [query.data]);
  const room = query.data?.pages[0]?.room ?? null;
  const initialRoomLoaded = query.isSuccess && query.data?.pages[0]?.room.id === roomId;

  useEffect(() => () => sendAttempts.reset(), [roomId, sendAttempts]);

  useEffect(() => {
    if (!initialRoomLoaded) return;
    void queryClient.invalidateQueries({ queryKey: webQueryKeys.rooms });
    void queryClient.invalidateQueries({ queryKey: webQueryKeys.bootstrap });
  }, [initialRoomLoaded, queryClient]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`room:${roomId}`, { config: { private: true } })
      .on("broadcast", { event: "messages-changed" }, (event) => {
        const parsed = roomMessageHintSchema.safeParse(event.payload);
        if (!parsed.success || parsed.data.room_id !== roomId) return;
        void queryClient.invalidateQueries({ queryKey: webQueryKeys.roomMessages(roomId) });
        void queryClient.invalidateQueries({ queryKey: webQueryKeys.rooms });
        void queryClient.invalidateQueries({ queryKey: webQueryKeys.bootstrap });
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
      (attempt) => sendRoomMessage(roomId, attempt.draft.content, attempt.clientId),
    ),
    onSuccess: ({ message }) => {
      setInput("");
      setSendError(null);
      queryClient.setQueryData<InfiniteData<RoomMessagesResponse>>(
        webQueryKeys.roomMessages(roomId),
        (current) => current
          ? {
              ...current,
              pages: current.pages.map((page, index) => index === 0
                ? { ...page, messages: [...page.messages, message] }
                : page),
            }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: webQueryKeys.roomMessages(roomId) });
      void queryClient.invalidateQueries({ queryKey: webQueryKeys.rooms });
      void queryClient.invalidateQueries({ queryKey: webQueryKeys.bootstrap });
    },
    onError: (error) => setSendError(error instanceof Error ? error.message : "Message could not be sent."),
  });

  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || sendMutation.isPending) return;
    sendMutation.mutate(content);
  }, [input, sendMutation]);

  if (query.isPending) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-hairline p-4"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-28" /></div>
        <div className="flex-1 p-4"><Skeleton className="h-16 w-52 rounded-2xl" /></div>
      </div>
    );
  }

  if (query.isError || !room) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="t-body text-ink-9">This room is unavailable.</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void query.refetch()}>Try again</button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <RoomHeader room={room} onBack={() => router.push("/")} />
      <ChatMessageList
        messages={messages}
        userId={user?.id ?? ""}
        onDelete={() => undefined}
        onEdit={() => undefined}
        onReply={() => undefined}
        canReply={false}
        allowMutations={false}
        hasOlder={query.hasNextPage}
        isLoadingOlder={query.isFetchingNextPage}
        onLoadOlder={() => { void query.fetchNextPage(); }}
      />
      {sendError ? <p role="alert" className="px-4 text-center text-xs text-danger-600">{sendError}</p> : null}
      <ChatComposer
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        isPending={sendMutation.isPending}
        replyingTo={null}
        onCancelReply={() => undefined}
        isEditing={false}
        editError={null}
        onCancelEdit={() => undefined}
        onSelectImage={() => undefined}
        allowImages={false}
      />
    </div>
  );
}
