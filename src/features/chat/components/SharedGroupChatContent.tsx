"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ArrowLeft, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createChatMessageAttemptCoordinator,
  mergeNewestFirstMessagePages,
  type ChatMessageAttempt,
  type DMMessage,
} from "@peekpoke/shared";
import { ChatComposer } from "@/features/chat/components/ChatComposer";
import { ChatMessageList } from "@/features/chat/components/ChatMessageList";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/useAuth";
import {
  sharedGroupQueryOptions,
  webQueryKeys,
  type SharedGroupQueryData,
} from "@/data/web-query";
import { markSharedGroupRead, sendSharedGroupMessage } from "@/data/shared-groups";
import { useAppStore } from "@/stores/appStore";

export function SharedGroupChatContent({ groupId }: { groupId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [input, setInput] = useState(() => useAppStore.getState().drafts[groupId] ?? "");
  const [sendError, setSendError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [readPending, setReadPending] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const [sendAttempts] = useState(() => createChatMessageAttemptCoordinator(() => crypto.randomUUID()));
  const conversationQuery = useInfiniteQuery(sharedGroupQueryOptions(groupId));
  const group = conversationQuery.data?.pages[0]?.group ?? null;
  const messages = useMemo(
    () => conversationQuery.data
      ? mergeNewestFirstMessagePages(conversationQuery.data.pages) as DMMessage[]
      : [],
    [conversationQuery.data],
  );

  useEffect(() => {
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
    if (!user?.id || !group) return;
    const controller = new AbortController();
    // The pending state mirrors the external read-receipt request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReadPending(true);
    setReadError(null);
    void markSharedGroupRead(groupId, controller.signal)
      .then(() => queryClient.invalidateQueries({ queryKey: webQueryKeys.groups }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setReadError(error instanceof Error ? error.message : "Unread status could not sync.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setReadPending(false);
      });
    return () => controller.abort();
  }, [group, groupId, queryClient, readAttempt, user?.id]);

  const sendMutation = useMutation({
    mutationFn: (attempt: ChatMessageAttempt) => sendSharedGroupMessage(groupId, {
      client_id: attempt.clientId,
      content: attempt.payload.content,
    }),
    retry: false,
    onSuccess: ({ message }) => {
      queryClient.setQueryData<InfiniteData<SharedGroupQueryData>>(webQueryKeys.groupMessages(groupId), (current) => {
        if (!current || current.pages.some((page) => page.messages.some((item) => item.id === message.id))) return current;
        return {
          ...current,
          pages: current.pages.map((page, index) => index === 0
            ? { ...page, messages: [...page.messages, message] }
            : page),
        };
      });
      sendAttempts.cancel();
      setInput("");
      useAppStore.getState().setDraft(groupId, "");
      setSendError(null);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: webQueryKeys.groupMessages(groupId) }),
        queryClient.invalidateQueries({ queryKey: webQueryKeys.groups }),
      ]);
    },
    onError: (error: Error) => setSendError(error.message),
  });

  function updateInput(value: string) {
    const pending = sendAttempts.peek();
    if (pending && (!value.trim() || !sendAttempts.matches({ content: value }))) {
      sendAttempts.cancel();
      setSendError(null);
    }
    setInput(value);
    useAppStore.getState().setDraft(groupId, value);
  }

  function submit(attempt = sendAttempts.peek()) {
    if (sendMutation.isPending) return;
    if (!attempt) {
      const content = input.trim();
      if (!content) return;
      try {
        attempt = sendAttempts.prepare({ content });
      } catch (error) {
        setSendError(error instanceof Error ? error.message : "Could not send message.");
        return;
      }
    }
    setSendError(null);
    sendMutation.mutate(attempt);
  }

  if (conversationQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="t-body text-ink-9">This shared group could not be loaded.</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void conversationQuery.refetch()}>Try again</button>
      </div>
    );
  }

  if (conversationQuery.isLoading || !group) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-hairline p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div>
        </div>
        <div className="flex-1 space-y-3 p-4"><Skeleton className="h-14 w-48" /><Skeleton className="ml-auto h-14 w-56" /><Skeleton className="h-14 w-40" /></div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-hairline bg-surface px-4 pb-3" style={{ paddingTop: "calc(var(--safe-area-top) + 12px)" }}>
        <button type="button" className="iconbtn md:hidden" style={{ width: 36, height: 36 }} onClick={() => router.push("/inbox")} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700"><Users aria-hidden="true" size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="t-body-b truncate text-ink-9">{group.name}</p>
          <p className="t-caption muted">{group.member_count} {group.member_count === 1 ? "member" : "members"} · anyone with the same code can join</p>
        </div>
      </div>

      {readError ? (
        <div className="flex items-center justify-between gap-3 border-b border-hairline bg-danger-50 px-4 py-2 text-sm text-danger-700" role="alert">
          <span>Unread status could not sync.</span>
          <button type="button" className="min-h-11 font-semibold" disabled={readPending} onClick={() => setReadAttempt((current) => current + 1)}>{readPending ? "Retrying…" : "Retry"}</button>
        </div>
      ) : null}

      <ChatMessageList
        messages={messages}
        userId={user?.id ?? ""}
        hasOlder={conversationQuery.hasNextPage}
        isLoadingOlder={conversationQuery.isFetchingNextPage}
        onLoadOlder={() => { void conversationQuery.fetchNextPage(); }}
        canReply={false}
      />

      {sendAttempts.peek() && sendError ? (
        <div className="mx-4 flex items-center justify-between gap-3 rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-[12px] text-danger-800 md:mx-auto md:w-full md:max-w-xl" role="alert">
          <span>{sendError} Your message is saved for retry.</span>
          <button type="button" className="shrink-0 font-semibold" disabled={sendMutation.isPending} onClick={() => submit()}>{sendMutation.isPending ? "Retrying…" : "Retry"}</button>
        </div>
      ) : null}
      <ChatComposer
        value={input}
        onChange={updateInput}
        onSubmit={(event) => { event.preventDefault(); submit(); }}
        isPending={sendMutation.isPending}
        replyingTo={null}
        onCancelReply={() => undefined}
        isEditing={false}
        editError={null}
        onCancelEdit={() => undefined}
      />
    </div>
  );
}
