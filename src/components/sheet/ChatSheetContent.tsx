"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Loader2, MoreVertical, Pencil, Trash2, X, Check, ChevronDown, ChevronLeft } from "lucide-react";
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
import { formatDistanceToNow, differenceInMinutes } from "date-fns";

const EDIT_WINDOW_MINUTES = 15;


type ThreadWithParticipants = DMThread & {
  participant_1: Profile;
  participant_2: Profile;
};

type ThreadData = {
  thread: ThreadWithParticipants;
  messages: DMMessage[];
};

interface ChatSheetContentProps {
  threadId: string;
}

export function ChatSheetContent({ threadId }: ChatSheetContentProps) {
  const { user } = useAuth();
  const router = useRouter();
  const rqClient = useQueryClient();
  const [input, setInput] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const hasSeeded = useRef(false);

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

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
  }, []);

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

  const canEditMessage = (msg: DMMessage) => {
    if (msg.sender_id !== user?.id || msg.is_deleted) return false;
    return differenceInMinutes(new Date(), new Date(msg.created_at)) <= EDIT_WINDOW_MINUTES;
  };

  const handleStartEdit = (msg: DMMessage) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content || "");
    setMenuOpenId(null);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent("");
  };

  const handleSaveEdit = async (messageId: string) => {
    if (!editContent.trim()) return;
    try {
      await fetch(`/api/dm/${threadId}/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
    } catch (error) {
      console.error("Failed to edit message:", error);
    }
    setEditingMessageId(null);
    setEditContent("");
  };

  const handleDelete = async (messageId: string) => {
    setMenuOpenId(null);
    try {
      await fetch(`/api/dm/${threadId}/${messageId}`, { method: "DELETE" });
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  };

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
            const isEditing = editingMessageId === msg.id;
            const showMenu = menuOpenId === msg.id;

            return (
              <div key={msg.id} className={cn("flex gap-2 group", isOwn ? "justify-end" : "justify-start")}>
                <div className={cn("flex items-start gap-1", isOwn && "flex-row-reverse")}>
                  <div className={cn("max-w-[75%] px-5 py-3.5", isOwn ? "message-bubble-sent animate-message-send" : "message-bubble-received animate-message-receive")}>
                    {msg.is_deleted ? (
                      <p className="italic opacity-60 text-[15px]">This message was deleted</p>
                    ) : isEditing ? (
                      <div className="flex items-center gap-2">
                        <Input value={editContent} onChange={(e) => setEditContent(e.target.value)} className="h-8 text-sm bg-background text-foreground" autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(msg.id); }
                            else if (e.key === "Escape") handleCancelEdit();
                          }}
                        />
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleSaveEdit(msg.id)}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleCancelEdit}><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <>
                        {msg.media_url && <img src={msg.media_url} alt="" loading="lazy" decoding="async" className="rounded mb-2 max-w-full" />}
                        <p className="text-[15px] leading-relaxed">{msg.content}</p>
                      </>
                    )}
                    <p className={cn("text-xs mt-1.5", isOwn ? "text-white/70" : "text-muted-foreground")}>
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                      {msg.is_edited && !msg.is_deleted && <span className="ml-1">(edited)</span>}
                    </p>
                  </div>
                  {isOwn && !msg.is_deleted && !isEditing && (
                    <div className="relative">
                      <Button size="sm" variant="ghost" className={cn("h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity", showMenu && "opacity-100")}
                        onClick={() => setMenuOpenId(showMenu ? null : msg.id)}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                      {showMenu && (
                        <div className="absolute top-8 right-0 z-10 bg-background shadow-neu-floating rounded-md border-0 py-1 min-w-[120px]">
                          {canEditMessage(msg) && (
                            <button className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2" onClick={() => handleStartEdit(msg)}>
                              <Pencil className="h-4 w-4" /> Edit
                            </button>
                          )}
                          <button className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2 text-destructive" onClick={() => handleDelete(msg.id)}>
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
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
    </div>
  );
}
