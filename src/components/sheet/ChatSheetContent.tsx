"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Loader2, Trash2, ChevronDown, ChevronLeft, Reply, Forward, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { cn, getInitials } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useIsUserOnline } from "@/hooks/usePresence";
import { useAppStore } from "@/stores/appStore";
import { useThreadMessages } from "@/stores/selectors";
import { isPremium, type DMThread, type DMMessage, type Profile } from "@/types/database";

type ThreadWithParticipants = DMThread & {
  participant_1: Profile;
  participant_2: Profile;
};

type ThreadData = {
  thread: ThreadWithParticipants;
  messages: DMMessage[];
};

type ContextMenuState = {
  messageId: string;
  message: DMMessage;
  rect: DOMRect;
  isOwn: boolean;
};

interface ChatSheetContentProps {
  threadId: string;
}

export function ChatSheetContent({ threadId }: ChatSheetContentProps) {
  const { user } = useAuth();
  const router = useRouter();
  const rqClient = useQueryClient();
  const [input, setInput] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [mounted, setMounted] = useState(false);
  const hasSeeded = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const storeMessages = useThreadMessages(threadId);
  const setThreadMessages = useAppStore((s) => s.setThreadMessages);
  const markThreadRead = useAppStore((s) => s.markThreadRead);
  const setActiveThreadId = useAppStore((s) => s.setActiveThreadId);

  const { data, isLoading } = useQuery({
    queryKey: ["dm-thread", threadId],
    queryFn: async () => {
      const r = await fetch(`/api/dm/${threadId}`);
      if (!r.ok) throw new Error("Failed to load thread");
      return r.json() as Promise<ThreadData>;
    },
    enabled: !!threadId,
  });

  const thread = data?.thread ?? null;

  useEffect(() => {
    if (data?.messages && data.messages.length > 0 && !hasSeeded.current) {
      setThreadMessages(threadId, data.messages);
      hasSeeded.current = true;
    }
  }, [data?.messages, threadId, setThreadMessages]);

  const messages = storeMessages.length > 0 ? (storeMessages as DMMessage[]) : (data?.messages ?? []);

  const otherParticipantId = thread
    ? (thread.participant_1_id === user?.id ? thread.participant_2_id : thread.participant_1_id)
    : undefined;
  const isOtherOnline = useIsUserOnline(otherParticipantId);

  useEffect(() => {
    setActiveThreadId(threadId);
    fetch(`/api/dm/${threadId}/read`, { method: "POST" });
    markThreadRead(threadId);
    return () => {
      const currentActiveThreadId = useAppStore.getState().activeThreadId;
      if (currentActiveThreadId === threadId) {
        useAppStore.getState().setActiveThreadId(null);
      }
    };
  }, [threadId, markThreadRead, setActiveThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close context menu on scroll
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
    if (contextMenu) setContextMenu(null);
  }, [contextMenu]);

  // Close context menu on Esc
  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [contextMenu]);

  useEffect(() => { setMounted(true); }, []);

  // Cleanup long press timer on unmount
  useEffect(() => () => clearTimeout(longPressTimer.current), []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/dm/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json() as Promise<{ message: DMMessage }>;
    },
    onSuccess: ({ message }) => {
      if (message) {
        rqClient.setQueryData<ThreadData>(["dm-thread", threadId], (old) => {
          if (!old) return old;
          const exists = old.messages.some((m) => m.id === message.id);
          if (exists) return old;
          return { ...old, messages: [...old.messages, message] };
        });
      }
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMutation.isPending) return;
    const content = input.trim();
    setInput("");
    sendMutation.mutate(content);
  };

  const handleDelete = async (messageId: string) => {
    try {
      await fetch(`/api/dm/${threadId}/${messageId}`, { method: "DELETE" });
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  };

  const openContextMenu = useCallback((el: HTMLElement, msg: DMMessage, isOwn: boolean) => {
    if (!isOwn || msg.is_deleted) return;
    const rect = el.getBoundingClientRect();
    setContextMenu({ messageId: msg.id, message: msg, rect, isOwn });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, msg: DMMessage, isOwn: boolean) => {
    e.preventDefault();
    openContextMenu(e.currentTarget as HTMLElement, msg, isOwn);
  }, [openContextMenu]);

  const handleTouchStart = useCallback((e: React.TouchEvent, msg: DMMessage, isOwn: boolean) => {
    const el = e.currentTarget as HTMLElement;
    longPressTimer.current = setTimeout(() => openContextMenu(el, msg, isOwn), 500);
  }, [openContextMenu]);

  const cancelLongPress = useCallback(() => {
    clearTimeout(longPressTimer.current);
  }, []);

  if (isLoading || !thread) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 flex items-center gap-4 border-b">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={cn("flex gap-3", i % 2 === 0 && "flex-row-reverse")}>
              <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
              <Skeleton className={cn("h-16 rounded-2xl", i % 2 === 0 ? "w-48" : "w-56")} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const other = thread.participant_1_id === user?.id ? thread.participant_2 : thread.participant_1;

  return (
    <div className="relative flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3 border-b border-border flex-shrink-0 bg-background shadow-neu-raised-sm">
        <button onClick={() => router.push("/inbox")} className="md:hidden p-1 -ml-1">
          <ChevronLeft className="h-6 w-6 text-foreground" />
        </button>
        <Avatar className="h-10 w-10">
          <AvatarImage src={other.avatar_url || undefined} alt={other.display_name || other.username} />
          <AvatarFallback className="bg-primary text-white">
            {getInitials(other.display_name || other.username)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-[16px] text-foreground">{other.display_name || other.username}</h3>
            {isPremium(other) && <PremiumBadge size="sm" />}
          </div>
          <p className="text-[13px]">
            {isOtherOnline ? <span className="text-success">Online</span> : <span className="text-muted-foreground">@{other.username}</span>}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="relative flex-1">
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto p-4 pb-20 space-y-4 scroll-container overscroll-contain"
        >
          {messages.map((msg) => {
            const isOwn = msg.sender_id === user?.id;

            return (
              <div key={msg.id} className={cn("flex gap-2", isOwn ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] px-5 py-3.5 select-none",
                    contextMenu?.messageId === msg.id && "opacity-0",
                    isOwn ? "message-bubble-sent animate-message-send" : "message-bubble-received animate-message-receive"
                  )}
                  style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" } as React.CSSProperties}
                  onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}
                  onTouchStart={(e) => handleTouchStart(e, msg, isOwn)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                  onTouchCancel={cancelLongPress}
                >
                  {msg.is_deleted ? (
                    <p className="italic opacity-60 text-[15px]">This message was deleted</p>
                  ) : (
                    <>
                      {msg.media_url && <img src={msg.media_url} alt="" loading="lazy" decoding="async" className="rounded mb-2 max-w-full" />}
                      <p className="text-[15px] leading-relaxed">{msg.content}</p>
                    </>
                  )}
                  {msg.is_edited && !msg.is_deleted && (
                    <p className={cn("text-xs mt-1.5", isOwn ? "text-white/70" : "text-muted-foreground")}>(edited)</p>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        {showScrollButton && (
          <button onClick={scrollToBottom} className="absolute bottom-20 right-4 h-10 w-10 rounded-full bg-background flex items-center justify-center shadow-neu-raised-sm" aria-label="Scroll to bottom">
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Input - floating overlay */}
      <form onSubmit={handleSend} className="absolute bottom-0 left-0 right-0 px-4 md:px-12 pb-3 pt-2 md:max-w-2xl md:left-1/2 md:-translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full bg-background border border-border px-3 py-1 overflow-hidden shadow-neu-floating">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message..." className="chat-input flex-1 focus-visible:ring-0 focus-visible:ring-offset-0" enterKeyHint="send" autoComplete="off" autoCorrect="on" />
          <Button type="submit" disabled={!input.trim() || sendMutation.isPending} className="chat-send-button">
            {sendMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
          </Button>
        </div>
      </form>

      {/* Context menu portal */}
      {contextMenu && mounted && createPortal(
        (() => {
          const vh = window.innerHeight;
          const r = contextMenu.rect;
          const isBottomHalf = r.top > vh / 2;
          const ghostTop = isBottomHalf ? vh / 2 - r.height / 2 : r.top;
          const menuTop = ghostTop + r.height + 8;
          const menuAlign = contextMenu.isOwn
            ? { right: window.innerWidth - r.right }
            : { left: r.left };
          return (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                onClick={() => setContextMenu(null)}
              />
              {/* Ghost bubble - same bubble, floats above backdrop */}
              <div
                className="fixed z-50 pointer-events-none transition-all duration-200"
                style={{ top: ghostTop, left: r.left, width: r.width }}
              >
                <div className={cn(
                  "w-full px-5 py-3.5",
                  contextMenu.isOwn ? "message-bubble-sent" : "message-bubble-received"
                )} style={{ boxShadow: "none" }}>
                  {contextMenu.message.media_url && (
                    <img src={contextMenu.message.media_url} alt="" loading="lazy" className="rounded mb-2 max-w-full" />
                  )}
                  <p className="text-[15px] leading-relaxed">{contextMenu.message.content}</p>
                  {contextMenu.message.is_edited && (
                    <p className={cn("text-xs mt-1.5", contextMenu.isOwn ? "text-white/70" : "text-muted-foreground")}>(edited)</p>
                  )}
                </div>
              </div>
              {/* Action menu — Instagram vertical list, below the bubble */}
              <div className="fixed z-50" style={{ top: menuTop, ...menuAlign }}>
                <div className="bg-background/95 rounded-2xl border border-border overflow-hidden min-w-[180px]">
                  <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-foreground">
                    <Reply className="h-5 w-5" /><span className="text-sm">Reply</span>
                  </button>
                  <div className="border-t border-border/50" />
                  <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-foreground">
                    <Forward className="h-5 w-5" /><span className="text-sm">Forward</span>
                  </button>
                  <div className="border-t border-border/50" />
                  <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-foreground">
                    <Copy className="h-5 w-5" /><span className="text-sm">Copy</span>
                  </button>
                  <div className="border-t border-border/50" />
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-destructive"
                    onClick={() => { handleDelete(contextMenu.messageId); setContextMenu(null); }}
                  >
                    <Trash2 className="h-5 w-5" /><span className="text-sm">Delete</span>
                  </button>
                </div>
              </div>
            </>
          );
        })(),
        document.body
      )}
    </div>
  );
}
