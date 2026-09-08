"use client";

import { CalendarClock, Send } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/features/inbox/components/EmptyState";
import { ChatSheetContent } from "@/features/chat/components/ChatSheetContent";
import { SharedGroupChatContent } from "@/features/chat/components/SharedGroupChatContent";

interface InboxChatPanelProps {
  threadId: string | null;
  groupId: string | null;
  tab: "pokes" | "plans" | "chats";
}

export function InboxChatPanel({ threadId, groupId, tab }: InboxChatPanelProps) {
  if (!threadId && !groupId) {
    if (tab === "pokes") return <InboxContextEmpty icon={<Send size={28} />} title="A small invitation can start something" description="Respond to a Poke from the list when the timing feels right." />;
    if (tab === "plans") return <InboxContextEmpty icon={<CalendarClock size={28} />} title="Make the details clear" description="Choose a Plan to view it, or create one from the list." />;
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {groupId ? <SharedGroupChatContent key={groupId} groupId={groupId} /> : <ChatSheetContent key={threadId} threadId={threadId!} />}
    </div>
  );
}

function InboxContextEmpty({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink-1 text-ink-5">{icon}</span>
      <div className="space-y-1"><p className="t-title-2 text-ink-9">{title}</p><p className="t-caption muted">{description}</p></div>
    </div>
  );
}
