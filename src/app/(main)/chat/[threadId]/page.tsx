"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, MoreVertical } from "lucide-react";
import { ChatSheetContent } from "@/components/sheet/ChatSheetContent";

export default function ChatPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = use(params);
  const router = useRouter();

  return (
    <div className="flex flex-col h-full bg-background">
      <ChatSheetContent threadId={threadId} />
    </div>
  );
}
