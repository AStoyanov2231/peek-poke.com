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
      <div className="px-6 space-y-4 pt-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center px-8">
        <p className="text-muted-foreground text-sm">No conversations yet</p>
        <p className="text-muted-foreground/70 text-xs mt-1">Find friends on the map to start chatting</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-2 py-2">
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
              "w-full flex items-center gap-3 px-2 py-3 text-left transition-all rounded-xl",
              isActive ? "md:shadow-neu-inset" : "md:hover:shadow-neu-inset"
            )}
          >
            <div className="relative flex-shrink-0">
              <Avatar className="h-[52px] w-[52px]">
                <AvatarImage src={avatarSrc || undefined} alt={name} />
                <AvatarFallback className="bg-primary text-white text-lg">
                  {getInitials(name)}
                </AvatarFallback>
              </Avatar>
              {isOnline && (
                <div className="absolute bottom-0 right-0 h-3 w-3 bg-success rounded-full border-2 border-background" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-semibold text-foreground truncate">{name}</p>
              {thread.last_message_preview && (
                <p className={cn("text-[14px] truncate", thread.unread_count ? "text-foreground font-medium" : "text-muted-foreground")}>
                  {thread.last_message_preview}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {thread.last_message_at && (
                <span className="text-[12px] text-muted-foreground">
                  {formatMessageTime(new Date(thread.last_message_at))}
                </span>
              )}
              {thread.unread_count ? (
                <div className="h-[22px] min-w-[22px] bg-primary rounded-full flex items-center justify-center px-1">
                  <span className="text-[11px] font-bold text-white">
                    {thread.unread_count > 9 ? "9+" : thread.unread_count}
                  </span>
                </div>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
