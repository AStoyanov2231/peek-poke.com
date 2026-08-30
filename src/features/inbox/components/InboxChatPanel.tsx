"use client";

import { EmptyState } from "@/features/inbox/components/EmptyState";
import { ChatSheetContent } from "@/features/chat/components/ChatSheetContent";

interface InboxChatPanelProps {
  threadId: string | null;
}

export function InboxChatPanel({ threadId }: InboxChatPanelProps) {
  if (!threadId) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ChatSheetContent key={threadId} threadId={threadId} />
    </div>
  );
}
