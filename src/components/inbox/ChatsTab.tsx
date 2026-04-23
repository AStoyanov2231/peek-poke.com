"use client";

import { useTransitionRouter } from "@/hooks/useTransitionRouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, getInitials } from "@/lib/utils";
import { useThreads, useIsMessagesLoaded } from "@/stores/selectors";
import { useAppStore, type DMThreadWithParticipants } from "@/stores/appStore";
import { useAuth } from "@/hooks/useAuth";
import { differenceInSeconds, formatDistanceToNow } from "date-fns";

function formatMessageTime(date: Date): string {
  const secondsAgo = differenceInSeconds(new Date(), date);
  if (secondsAgo < 60) return "Now";
  return formatDistanceToNow(date, { addSuffix: false });
}

interface ChatsTabProps {
  onSelectThread: (threadId: string) => void;
  activeThreadId: string | null;
}

export function ChatsTab({ onSelectThread, activeThreadId }: ChatsTabProps) {
  const router = useTransitionRouter();
  const { user } = useAuth();
  const threads = useThreads();
  const isLoaded = useIsMessagesLoaded();
  const onlineUsers = useAppStore((s) => s.onlineUsers);

  function getOtherParticipant(thread: DMThreadWithParticipants) {
    return thread.participant_1_id === user?.id ? thread.participant_2 : thread.participant_1;
  }

  function handleThreadClick(threadId: string) {
    if (window.innerWidth < 768) {
      router.push(`/chat/${threadId}`);
    } else {
      onSelectThread(threadId);
    }
  }

  if (!isLoaded) {
    return (
      <div className="px-3 space-y-1 pt-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center px-8">
        <p className="t-body muted">No conversations yet</p>
        <p className="t-caption muted mt-1">Find friends on the map to start chatting</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      {threads.map((thread) => {
        const otherUser = getOtherParticipant(thread);
        const name = otherUser?.display_name || otherUser?.username || "";
        const avatarSrc = otherUser?.avatar_url;
        const isOnline = otherUser ? onlineUsers.has(otherUser.id) : false;
        const isActive = thread.id === activeThreadId;

        return (
          <button
            key={thread.id}
            onClick={() => handleThreadClick(thread.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-3 text-left transition-all rounded-xl active:scale-[0.98]",
              isActive ? "bg-ink-1" : "md:hover:bg-ink-1"
            )}
          >
            <div className="relative flex-shrink-0" onClick={(e) => { e.stopPropagation(); if (otherUser?.id) router.push(`/profile/${otherUser.id}`); }}>
              <Avatar className="h-[52px] w-[52px]">
                <AvatarImage src={avatarSrc || undefined} alt={name} />
                <AvatarFallback name={name} />
              </Avatar>
              {isOnline && (
                <span className="absolute bottom-0.5 right-0.5 block h-2.5 w-2.5 rounded-full bg-success-500 ring-2 ring-surface" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn("t-body-b truncate", thread.unread_count ? "text-ink-9" : "text-ink-8")}>{name}</p>
                {thread.last_message_at && (
                  <span className="t-caption muted flex-shrink-0">
                    {formatMessageTime(new Date(thread.last_message_at))}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                {thread.last_message_preview && (
                  <p className={cn("t-caption truncate", thread.unread_count ? "text-ink-8 font-medium" : "muted")}>
                    {thread.last_message_preview}
                  </p>
                )}
                {thread.unread_count ? (
                  <span className="badge flex-shrink-0" style={{ background: "var(--accent-500)", minWidth: 18, height: 18, fontSize: 10 }}>
                    {thread.unread_count > 9 ? "9+" : thread.unread_count}
                  </span>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
