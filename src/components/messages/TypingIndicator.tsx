"use client";

import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  className?: string;
  userName?: string;
}

export function TypingIndicator({ className, userName }: TypingIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-2 text-muted-foreground text-sm", className)}>
      {userName && <span className="font-medium">{userName}</span>}
      <div className="message-bubble-received px-4 py-2.5 inline-flex items-center gap-1">
        <div className="typing-dots">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      </div>
    </div>
  );
}
