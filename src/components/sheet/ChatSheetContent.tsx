"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useIsUserOnline } from "@/hooks/usePresence";
import { useProximityToThread } from "@/hooks/useProximityToThread";
import { useAppStore } from "@/stores/appStore";
import { useThreadMessages } from "@/stores/selectors";
import { type DMThread, type DMMessage, type Profile } from "@/types/database";
import { ChatHeader } from "@/components/sheet/ChatHeader";
import { ChatProximityBanner } from "@/components/sheet/ChatProximityBanner";
import { ChatMessageList } from "@/components/sheet/ChatMessageList";
import { ChatComposer } from "@/components/sheet/ChatComposer";

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
  const { distanceMeters, isNearby } = useProximityToThread(threadId);

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
          if (old.messages.some((m) => m.id === message.id)) return old;
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

  if (isLoading || !thread) {
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

  const other = thread.participant_1_id === user?.id ? thread.participant_2 : thread.participant_1;

  return (
    <div className="relative flex flex-col h-full">
      <ChatHeader
        other={other}
        isOnline={isOtherOnline}
        distanceMeters={distanceMeters}
        onBack={() => router.push("/inbox")}
      />

      {isNearby && distanceMeters !== null && (
        <ChatProximityBanner
          distanceMeters={distanceMeters}
          name={other.display_name || other.username}
          threadId={threadId}
        />
      )}

      <ChatMessageList
        messages={messages}
        userId={user?.id ?? ""}
        onDelete={handleDelete}
      />

      <ChatComposer
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        isPending={sendMutation.isPending}
      />
    </div>
  );
}
