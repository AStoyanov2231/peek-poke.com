"use client";

import { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { useAppStore } from "@/stores/appStore";
import { type DMMessage } from "@/types/database";
import {
  createChatMessageAttemptCoordinator,
  createChatMessageUiLifecycle,
  createDmMessageMutationCoordinator,
  mergeNewestFirstMessagePages,
  type ChatMessageAttempt,
  type ChatMessageDraft,
  type ChatMessageSubmissionToken,
  type DmMessageMutationAttempt,
} from "@peekpoke/shared";
import { ChatHeader } from "@/features/chat/components/ChatHeader";
import { ChatMessageList } from "@/features/chat/components/ChatMessageList";
import { ChatComposer } from "@/features/chat/components/ChatComposer";
import { useCallStore } from "@/stores/callStore";
import { compressImage, createThumbnail } from "@/lib/image-compression";
import {
  threadQueryOptions,
  webQueryKeys,
  type ThreadQueryData,
} from "@/data/web-query";
import { useTypingIndicator } from "@/features/chat/useTypingIndicator";
import { uploadAndSendChatMedia } from "@/features/chat/upload-chat-media";
import { sendPreparedWebChatMessage } from "@/data/chat-message";
import { useReadReceipt } from "@/features/chat/useReadReceipt";
import { ReadReceiptRecovery } from "@/features/chat/components/ReadReceiptRecovery";
import { mutatePreparedWebDmMessage } from "@/data/dm-message-mutations";

interface ChatSheetContentProps {
  threadId: string;
}

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// This component owns the chat sheet's query, mutation, and composer lifecycle.
// react-doctor-disable-next-line no-giant-component
export function ChatSheetContent({ threadId }: ChatSheetContentProps) {
  const { user } = useAuth();
  const router = useRouter();
  const rqClient = useQueryClient();
  // Seed from the per-thread draft so in-progress input survives navigating
  // away (native tab switches included); write-through keeps the draft current.
  const [input, setInputState] = useState(
    () => useAppStore.getState().drafts[threadId] ?? ""
  );
  const draftThreadRef = useRef(threadId);
  const setInput = useCallback(
    (text: string) => {
      setInputState(text);
      useAppStore.getState().setDraft(threadId, text);
    },
    [threadId]
  );
  // Marking a thread read is a lifecycle side effect tied to the opened sheet.
  // react-doctor-disable-next-line no-fetch-in-effect
  useEffect(() => {
    // Thread switched without a remount — load the new thread's draft
    if (draftThreadRef.current !== threadId) {
      draftThreadRef.current = threadId;
      setInputState(useAppStore.getState().drafts[threadId] ?? "");
    }
  }, [threadId]);
  const [replyingTo, setReplyingTo] = useState<DMMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<DMMessage | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteRecovery, setDeleteRecovery] = useState<{
    messageId: string;
    error: string;
  } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [hasPendingImage, setHasPendingImage] = useState(false);
  const lifecycleOwnerRef = useRef<PropertyKey | null>(null);
  const [sendAttempts] = useState(() =>
    createChatMessageAttemptCoordinator(() => crypto.randomUUID()),
  );
  const [sendLifecycle] = useState(() =>
    createChatMessageUiLifecycle(() => lifecycleOwnerRef.current),
  );
  const [messageMutations] = useState(() =>
    createDmMessageMutationCoordinator(() => crypto.randomUUID()),
  );
  const startOutgoingCall = useCallStore((s) => s.startOutgoingCall);
  const setActiveThreadId = useAppStore((s) => s.setActiveThreadId);
  const readReceipt = useReadReceipt(user?.id, threadId);

  const conversationQuery = useInfiniteQuery(threadQueryOptions(threadId));

  const thread = conversationQuery.data?.pages[0]?.thread ?? null;
  const messages = conversationQuery.data
    ? mergeNewestFirstMessagePages(conversationQuery.data.pages) as DMMessage[]
    : [];

  const other = thread
    ? (thread.participant_1_id === user?.id ? thread.participant_2 : thread.participant_1)
    : null;
  const isReadOnly = other?.account_deleted === true;
  const { isPeerTyping, notifyTyping } = useTypingIndicator(threadId, user?.id);

  const isOtherOnline = other?.is_online === true && !isReadOnly;

  const lifecycleOwnerIdentity = JSON.stringify([threadId, user?.id ?? null]);
  useClientLayoutEffect(() => {
    lifecycleOwnerRef.current = lifecycleOwnerIdentity;
    return () => {
      lifecycleOwnerRef.current = null;
      sendAttempts.reset();
      sendLifecycle.reset();
      messageMutations.reset();
    };
  }, [lifecycleOwnerIdentity, messageMutations, sendAttempts, sendLifecycle]);

  useEffect(() => {
    setActiveThreadId(threadId);
    return () => {
      const currentActiveThreadId = useAppStore.getState().activeThreadId;
      if (currentActiveThreadId === threadId) {
        useAppStore.getState().setActiveThreadId(null);
      }
    };
  }, [rqClient, setActiveThreadId, threadId]);

  const sendMutation = useMutation({
    mutationFn: ({ attempt }: { attempt: ChatMessageAttempt; token: ChatMessageSubmissionToken }) =>
      sendAttempts.run(attempt.draft, (pendingAttempt) =>
        sendPreparedWebChatMessage(threadId, pendingAttempt),
      ),
    retry: false,
    onSuccess: ({ message }, { attempt, token }) =>
      sendLifecycle.commitOnce(token, attempt.clientId, async () => {
        if (message) {
          rqClient.setQueryData<InfiniteData<ThreadQueryData>>(webQueryKeys.messages(threadId), (old) => {
            if (!old) return old;
            if (old.pages.some((page) => page.messages.some((item) => item.id === message.id))) return old;
            return {
              ...old,
              pages: old.pages.map((page, index) => index === 0
                ? { ...page, messages: [...page.messages, message] }
                : page),
            };
          });
        }
        await Promise.all([
          rqClient.invalidateQueries({ queryKey: webQueryKeys.messages(threadId) }),
          rqClient.invalidateQueries({ queryKey: webQueryKeys.threads }),
        ]);
        sendLifecycle.runIfCurrent(token, () => {
          if (!attempt.draft.mediaUrl) setInput("");
          setReplyingTo(null);
          setHasPendingImage(false);
          setEditError(null);
        });
      }),
    onError: (error: Error, { token }) =>
      sendLifecycle.commitOnce(token, token.nonce, () => {
        setEditError(error.message);
      }),
  });

  const editMutation = useMutation({
    mutationFn: ({ attempt }: {
      attempt: DmMessageMutationAttempt;
      token: ChatMessageSubmissionToken;
    }) => messageMutations.run(
      attempt.scope,
      attempt.mutation,
      mutatePreparedWebDmMessage,
    ),
    retry: false,
    onSuccess: ({ message }, { attempt, token }) =>
      sendLifecycle.commitOnce(token, token.nonce, () => {
        if (!messageMutations.isGenerationCurrent(attempt)) return;
        rqClient.setQueryData<InfiniteData<ThreadQueryData>>(webQueryKeys.messages(threadId), (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((item) => item.id === message.id ? message : item),
                })),
              }
            : current);
        setEditingMessage(null);
        setEditError(null);
        setInput("");
        void rqClient.invalidateQueries({ queryKey: webQueryKeys.messages(threadId) });
      }),
    onError: (error: Error, { attempt, token }) =>
      sendLifecycle.commitOnce(token, token.nonce, () => {
        if (!messageMutations.isGenerationCurrent(attempt)) return;
        setEditError(error.message);
      }),
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content) return;

    if (editingMessage) {
      if (!user?.id) return;
      if (editMutation.isPending) return;
      const token = sendLifecycle.begin();
      if (!token) return;
      try {
        const attempt = messageMutations.prepare(
          { accountId: user.id, threadId, messageId: editingMessage.id },
          { kind: "edit", content },
        );
        editMutation.mutate(
          { attempt, token },
          { onSettled: () => sendLifecycle.end(token) },
        );
      } catch (error) {
        sendLifecycle.commitOnce(token, token.nonce, () => {
          setEditError(error instanceof Error ? error.message : "Failed to edit message");
        });
        sendLifecycle.end(token);
      }
      return;
    }

    if (sendMutation.isPending) return;
    const token = sendLifecycle.begin();
    if (!token) return;
    if (sendAttempts.peek()?.draft.mediaUrl) {
      sendAttempts.cancel();
      setHasPendingImage(false);
    }
    setEditError(null);
    try {
      const attempt = sendAttempts.prepare({ content, replyToId: replyingTo?.id });
      sendMutation.mutate(
        { attempt, token },
        { onSettled: () => sendLifecycle.end(token) },
      );
    } catch (error) {
      sendLifecycle.commitOnce(token, token.nonce, () => {
        setEditError(error instanceof Error ? error.message : "Failed to send message");
      });
      sendLifecycle.end(token);
    }
  };

  const handleDelete = async (messageId: string) => {
    if (!user?.id) return;
    let attempt: DmMessageMutationAttempt;
    try {
      attempt = messageMutations.prepare(
        { accountId: user.id, threadId, messageId },
        { kind: "delete" },
      );
      setDeleteRecovery(null);
      const { message } = await messageMutations.run(
        attempt.scope,
        attempt.mutation,
        mutatePreparedWebDmMessage,
      );
      if (!messageMutations.isGenerationCurrent(attempt)) return;
      rqClient.setQueryData<InfiniteData<ThreadQueryData>>(webQueryKeys.messages(threadId), (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                messages: page.messages.map((item) => item.id === message.id ? message : item),
              })),
            }
          : current);
      void rqClient.invalidateQueries({ queryKey: webQueryKeys.threads });
    } catch (error) {
      const current = messageMutations.peek();
      if (!current || current.scope.messageId !== messageId) return;
      setDeleteRecovery({
        messageId,
        error: error instanceof Error ? error.message : "Delete failed",
      });
    }
  };

  const handleImage = async (file: File) => {
    if (!user?.id || uploadingImage || sendMutation.isPending) return;
    const token = sendLifecycle.begin();
    if (!token) return;
    sendAttempts.cancel();
    setHasPendingImage(false);
    setUploadingImage(true);
    setEditError(null);
    let mutationStarted = false;
    try {
      const [compressed, thumbnail] = await Promise.all([
        compressImage(file),
        createThumbnail(file),
      ]);
      const formData = new FormData();
      formData.append("file", compressed);
      formData.append("thumbnail", thumbnail);
      await uploadAndSendChatMedia(formData, user.id, (upload) => {
        const attempt = sendAttempts.prepare({
          content: "Photo",
          replyToId: replyingTo?.id,
          mediaUrl: upload.url,
          mediaThumbnailUrl: upload.thumbnailUrl,
        });
        mutationStarted = true;
        return sendMutation.mutateAsync({ attempt, token });
      });
    } catch (error) {
      if (!mutationStarted) {
        sendLifecycle.commitOnce(token, token.nonce, () => {
          setEditError(error instanceof Error ? error.message : "Image upload failed");
        });
      }
      sendLifecycle.runIfCurrent(token, () => {
        setHasPendingImage(Boolean(sendAttempts.peek()?.draft.mediaUrl));
      });
    } finally {
      sendLifecycle.runIfCurrent(token, () => setUploadingImage(false));
      sendLifecycle.end(token);
    }
  };

  const handleRetryImage = async () => {
    const attempt = sendAttempts.peek();
    if (!attempt?.draft.mediaUrl || uploadingImage || sendMutation.isPending) return;
    const token = sendLifecycle.begin();
    if (!token) return;
    setUploadingImage(true);
    setEditError(null);
    try {
      await sendMutation.mutateAsync({ attempt, token });
    } catch {
      sendLifecycle.runIfCurrent(token, () => setHasPendingImage(true));
    } finally {
      sendLifecycle.runIfCurrent(token, () => setUploadingImage(false));
      sendLifecycle.end(token);
    }
  };

  const handleDiscardImage = () => {
    if (!sendAttempts.cancel()) return;
    setHasPendingImage(false);
    setEditError(null);
  };

  const handleEdit = useCallback((msg: DMMessage) => {
    if (!sendAttempts.cancel()) return;
    if (!messageMutations.cancel()) return;
    setHasPendingImage(false);
    setDeleteRecovery(null);
    setEditingMessage(msg);
    setEditError(null);
    setInput(msg.content ?? "");
    setReplyingTo(null);
  }, [messageMutations, sendAttempts, setInput]);

  const handleReply = useCallback((msg: DMMessage) => {
    if (isReadOnly) return;
    if (!sendAttempts.cancel()) return;
    setHasPendingImage(false);
    setReplyingTo(msg);
    setEditingMessage(null);
    setEditError(null);
    setInput("");
  }, [isReadOnly, sendAttempts, setInput]);

  const handleCancelEdit = useCallback(() => {
    if (!sendAttempts.cancel()) return;
    if (!messageMutations.cancel()) return;
    setEditingMessage(null);
    setEditError(null);
    setInput("");
  }, [messageMutations, sendAttempts, setInput]);

  const handleCancelReply = useCallback(() => {
    if (!sendAttempts.cancel()) return;
    setHasPendingImage(false);
    setReplyingTo(null);
  }, [sendAttempts]);

  const handleStartCall = useCallback(() => {
    if (!user?.id || !other || isReadOnly) return;
    const callId = crypto.randomUUID();
    startOutgoingCall(user.id, threadId, callId, {
      id: other.id,
      display_name: other.display_name,
      username: other.username,
      avatar_url: other.avatar_url,
    });
  }, [user?.id, threadId, other, isReadOnly, startOutgoingCall]);

  const replyingToDisplay = replyingTo ? {
    senderName: replyingTo.sender_id === user?.id
      ? "Yourself"
      : (other?.display_name || other?.username || "User"),
    content: replyingTo.content,
  } : null;

  if (conversationQuery.isLoading || !thread || !other) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 flex items-center gap-4 border-b border-hairline">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="flex-1 p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={cn("flex gap-3", i % 2 === 0 && "flex-row-reverse")}>
              <Skeleton className={cn("h-16 rounded-2xl", i % 2 === 0 ? "w-48" : "w-56")} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ChatHeader
        other={other}
        isOnline={isOtherOnline}
        isTyping={isPeerTyping}
        onBack={() => router.push("/inbox")}
        onStartCall={isReadOnly ? undefined : handleStartCall}
      />

      {readReceipt.error ? (
        <ReadReceiptRecovery pending={readReceipt.isPending} onRetry={readReceipt.retry} />
      ) : null}


      <ChatMessageList
        messages={messages}
        userId={user?.id ?? ""}
        hasOlder={conversationQuery.hasNextPage}
        isLoadingOlder={conversationQuery.isFetchingNextPage}
        onLoadOlder={() => { void conversationQuery.fetchNextPage(); }}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onReply={handleReply}
        canReply={!isReadOnly}
      />

      {isReadOnly && !editingMessage ? (
        <div className="border-t border-hairline bg-surface px-4 py-4 text-center t-caption text-ink-5">
          This account was deleted. The conversation history is read-only.
        </div>
      ) : (
        <>
          {hasPendingImage ? (
            <div className="mx-4 flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface px-3 py-2 text-[12px] text-ink-6 md:mx-auto md:w-full md:max-w-xl">
              <span>Photo ready to retry without uploading again.</span>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="font-semibold text-accent" onClick={() => void handleRetryImage()}>
                  Retry
                </button>
                <button type="button" className="text-ink-5" onClick={handleDiscardImage}>
                  Discard
                </button>
              </div>
            </div>
          ) : null}
          {deleteRecovery ? (
            <div
              role="alert"
              className="mx-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 md:mx-auto md:w-full md:max-w-xl"
            >
              <span>{deleteRecovery.error}</span>
              <div className="flex shrink-0 gap-3">
                <button
                  type="button"
                  className="font-semibold"
                  onClick={() => void handleDelete(deleteRecovery.messageId)}
                >
                  Retry delete
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!messageMutations.cancel()) return;
                    setDeleteRecovery(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <ChatComposer
            value={input}
            onChange={(value) => {
              const pending = !editingMessage ? sendAttempts.peek() : null;
              if (pending?.draft.mediaUrl) {
                if (sendAttempts.cancel()) setHasPendingImage(false);
              } else if (pending) {
                const nextDraft = { content: value, replyToId: replyingTo?.id };
                if (!value.trim() || !sendAttempts.matches(nextDraft)) sendAttempts.cancel();
              }
              setInput(value);
              if (value.trim() && !editingMessage) notifyTyping();
            }}
            onSubmit={handleSend}
            isPending={sendMutation.isPending || editMutation.isPending || uploadingImage}
            replyingTo={replyingToDisplay}
            onCancelReply={handleCancelReply}
            isEditing={!!editingMessage}
            editError={editError}
            onCancelEdit={handleCancelEdit}
            onSelectImage={(file) => void handleImage(file)}
          />
        </>
      )}
    </div>
  );
}
