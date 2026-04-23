"use client";

import { ArrowUp, Loader2 } from "lucide-react";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
}

export function ChatComposer({ value, onChange, onSubmit, isPending }: ChatComposerProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-2"
    >
      <div
        className="flex items-center gap-2 rounded-full px-3 py-1.5"
        style={{
          background: "var(--ink-1)",
          border: "1px solid var(--hairline)",
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Message..."
          className="chat-input flex-1 text-[15px]"
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="on"
        />
        <button
          type="submit"
          disabled={!value.trim() || isPending}
          className="chat-send-button flex-shrink-0"
          aria-label="Send message"
        >
          {isPending
            ? <Loader2 size={18} className="animate-spin" />
            : <ArrowUp size={18} />}
        </button>
      </div>
    </form>
  );
}
