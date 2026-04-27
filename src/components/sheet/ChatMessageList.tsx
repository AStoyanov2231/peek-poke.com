"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Trash2, Reply, Forward, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { type DMMessage } from "@/types/database";

interface ChatMessageListProps {
  messages: DMMessage[];
  userId: string;
  onDelete: (messageId: string) => void;
}

type ContextMenuState = {
  messageId: string;
  message: DMMessage;
  rect: DOMRect;
  isOwn: boolean;
};

const GROUP_GAP_SECONDS = 60;

function isGrouped(prev: DMMessage, curr: DMMessage): boolean {
  if (prev.sender_id !== curr.sender_id) return false;
  const prevTime = new Date(prev.created_at).getTime();
  const currTime = new Date(curr.created_at).getTime();
  return (currTime - prevTime) / 1000 < GROUP_GAP_SECONDS;
}

export function ChatMessageList({ messages, userId, onDelete }: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => () => clearTimeout(longPressTimer.current), []);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [contextMenu]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
    if (contextMenu) setContextMenu(null);
  }, [contextMenu]);

  const openContextMenu = useCallback((el: HTMLElement, msg: DMMessage, isOwn: boolean) => {
    if (!isOwn || msg.is_deleted) return;
    setContextMenu({ messageId: msg.id, message: msg, rect: el.getBoundingClientRect(), isOwn });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, msg: DMMessage, isOwn: boolean) => {
    e.preventDefault();
    openContextMenu(e.currentTarget as HTMLElement, msg, isOwn);
  }, [openContextMenu]);

  const handleTouchStart = useCallback((e: React.TouchEvent, msg: DMMessage, isOwn: boolean) => {
    const el = e.currentTarget as HTMLElement;
    longPressTimer.current = setTimeout(() => openContextMenu(el, msg, isOwn), 500);
  }, [openContextMenu]);

  const cancelLongPress = useCallback(() => clearTimeout(longPressTimer.current), []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto px-4 pb-20 scroll-container overscroll-contain"
        style={{ paddingTop: 12 }}
      >
        {messages.map((msg, i) => {
          const isOwn = msg.sender_id === userId;
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const grouped = prev ? isGrouped(prev, msg) : false;
          const isLastInGroup = !next || !isGrouped(msg, next);

          return (
            <div
              key={msg.id}
              className={cn("flex", isOwn ? "justify-end" : "justify-start")}
              style={{ marginTop: grouped ? 2 : 12 }}
            >
              <div
                data-last-in-group={isLastInGroup ? "true" : undefined}
                className={cn(
                  "max-w-[75%] px-4 py-2.5 select-none",
                  contextMenu?.messageId === msg.id && "opacity-0",
                  isOwn ? "message-bubble-sent animate-message-send" : "message-bubble-received animate-message-receive"
                )}
                style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" } as React.CSSProperties}
                onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}
                onTouchStart={(e) => handleTouchStart(e, msg, isOwn)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
                onTouchCancel={cancelLongPress}
              >
                {msg.is_deleted ? (
                  <p className="italic opacity-60 text-[15px]">This message was deleted</p>
                ) : (
                  <>
                    {msg.media_url && (
                      <img src={msg.media_url} alt="" loading="lazy" decoding="async" className="rounded mb-2 max-w-full" />
                    )}
                    <p className="text-[15px] leading-relaxed">{msg.content}</p>
                  </>
                )}
                {msg.is_edited && !msg.is_deleted && (
                  <p className={cn("text-xs mt-1", isOwn ? "text-white/70" : "muted")}>(edited)</p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="iconbtn absolute right-4 shadow-e-1"
          style={{ bottom: 88, width: 36, height: 36 }}
          aria-label="Scroll to bottom"
        >
          <ChevronDown size={18} />
        </button>
      )}

      {contextMenu && mounted && createPortal(
        (() => {
          const vh = window.innerHeight;
          const r = contextMenu.rect;
          const isBottomHalf = r.top > vh / 2;
          const ghostTop = isBottomHalf ? vh / 2 - r.height / 2 : r.top;
          const menuTop = ghostTop + r.height + 8;
          const menuAlign = contextMenu.isOwn
            ? { right: window.innerWidth - r.right }
            : { left: r.left };

          return (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                onClick={() => setContextMenu(null)}
              />
              <div
                className="fixed z-50 pointer-events-none"
                style={{ top: ghostTop, left: r.left, width: r.width }}
              >
                <div className={cn("w-full px-4 py-2.5", contextMenu.isOwn ? "message-bubble-sent" : "message-bubble-received")} style={{ boxShadow: "none" }}>
                  {contextMenu.message.media_url && (
                    <img src={contextMenu.message.media_url} alt="" loading="lazy" className="rounded mb-2 max-w-full" />
                  )}
                  <p className="text-[15px] leading-relaxed">{contextMenu.message.content}</p>
                  {contextMenu.message.is_edited && (
                    <p className={cn("text-xs mt-1", contextMenu.isOwn ? "text-white/70" : "muted")}>(edited)</p>
                  )}
                </div>
              </div>
              <div className="fixed z-50" style={{ top: menuTop, ...menuAlign }}>
                <div className="bg-surface rounded-lg border border-hairline overflow-hidden min-w-[180px] shadow-e-2">
                  <button className="w-full flex items-center gap-3 px-4 py-3 md:hover:bg-ink-1 t-body text-ink-8">
                    <Reply size={18} />Reply
                  </button>
                  <div className="hr" />
                  <button className="w-full flex items-center gap-3 px-4 py-3 md:hover:bg-ink-1 t-body text-ink-8">
                    <Forward size={18} />Forward
                  </button>
                  <div className="hr" />
                  <button className="w-full flex items-center gap-3 px-4 py-3 md:hover:bg-ink-1 t-body text-ink-8">
                    <Copy size={18} />Copy
                  </button>
                  <div className="hr" />
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 md:hover:bg-ink-1 t-body text-danger-500"
                    onClick={() => { onDelete(contextMenu.messageId); setContextMenu(null); }}
                  >
                    <Trash2 size={18} />Delete
                  </button>
                </div>
              </div>
            </>
          );
        })(),
        document.body
      )}
    </div>
  );
}
