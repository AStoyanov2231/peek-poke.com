"use client";

import { ArrowUp, Loader2, X, CornerUpLeft, Pencil } from "lucide-react";

interface ReplyPreview {
  senderName: string;
  content: string | null;
}

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  replyingTo: ReplyPreview | null;
  onCancelReply: () => void;
  isEditing: boolean;
  editError: string | null;
  onCancelEdit: () => void;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  isPending,
  replyingTo,
  onCancelReply,
  isEditing,
  editError,
  onCancelEdit,
}: ChatComposerProps) {
  const hasText = value.trim().length > 0;

  return (
    <form
      onSubmit={onSubmit}
      className="px-4 pb-4 pt-2 flex-shrink-0"
    >
      <div className="md:max-w-xl md:mx-auto">
        {replyingTo && (
          <div className="flex items-start gap-2 mb-2 px-1">
            <CornerUpLeft size={14} className="text-accent mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-accent truncate">{replyingTo.senderName}</p>
              <p className="text-[12px] muted truncate">{replyingTo.content || "Message deleted"}</p>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              className="flex-shrink-0 p-0.5 rounded-full md:hover:bg-ink-1"
              aria-label="Cancel reply"
            >
              <X size={14} className="muted" />
            </button>
          </div>
        )}
        {isEditing && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <Pencil size={14} className="text-accent flex-shrink-0" />
            <p className="flex-1 text-[12px] text-accent">
              {editError ?? "Editing message"}
            </p>
            <button
              type="button"
              onClick={onCancelEdit}
              className="flex-shrink-0 p-0.5 rounded-full md:hover:bg-ink-1"
              aria-label="Cancel edit"
            >
              <X size={14} className="muted" />
            </button>
          </div>
        )}
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
            placeholder={isEditing ? "Edit message..." : "Message..."}
            className="chat-input flex-1 text-[15px]"
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="on"
          />
          <button
            type="submit"
            disabled={!hasText || isPending}
            className="chat-send-button flex-shrink-0 transition-all duration-200 ease-out"
            aria-label={isEditing ? "Save edit" : "Send message"}
            style={{
              opacity: hasText ? 1 : 0,
              transform: hasText ? "translateY(0)" : "translateY(8px)",
              pointerEvents: hasText ? "auto" : "none",
            }}
          >
            {isPending
              ? <Loader2 size={18} className="animate-spin" />
              : <ArrowUp size={18} />}
          </button>
        </div>
      </div>
    </form>
  );
}
