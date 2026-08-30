"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, MoreVertical } from "lucide-react";
import { ChatSheetContent } from "@/features/chat/components/ChatSheetContent";

export default function ChatPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = use(params);
  const router = useRouter();

  return (
    <div className="flex flex-col h-full bg-background">
      <ChatSheetContent key={threadId} threadId={threadId} />
    </div>
  );
}
