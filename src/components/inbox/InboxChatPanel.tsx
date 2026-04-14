"use client";

import { EmptyState } from "@/components/inbox/EmptyState";
import { ChatSheetContent } from "@/components/sheet/ChatSheetContent";

interface InboxChatPanelProps {
  threadId: string | null;
}

export function InboxChatPanel({ threadId }: InboxChatPanelProps) {
  if (!threadId) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ChatSheetContent threadId={threadId} />
    </div>
  );
}
