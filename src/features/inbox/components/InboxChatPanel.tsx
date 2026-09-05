"use client";

import { EmptyState } from "@/features/inbox/components/EmptyState";
import { ChatSheetContent } from "@/features/chat/components/ChatSheetContent";
import { SharedGroupChatContent } from "@/features/chat/components/SharedGroupChatContent";

interface InboxChatPanelProps {
  threadId: string | null;
  groupId: string | null;
}

export function InboxChatPanel({ threadId, groupId }: InboxChatPanelProps) {
  if (!threadId && !groupId) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {groupId ? <SharedGroupChatContent key={groupId} groupId={groupId} /> : <ChatSheetContent key={threadId} threadId={threadId!} />}
    </div>
  );
}
