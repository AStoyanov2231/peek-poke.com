import { MessageCircle } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-3">
      <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center">
        <MessageCircle className="w-8 h-8 text-border" strokeWidth={1.5} />
      </div>
      <p className="text-foreground font-medium">Select a conversation</p>
      <p className="text-muted-foreground text-sm">Choose from your chats on the left to start messaging</p>
    </div>
  );
}
