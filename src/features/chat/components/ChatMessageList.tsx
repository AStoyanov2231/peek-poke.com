"use client";

import { useRef, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronDown, Trash2, Copy, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { type DMMessage } from "@/types/database";
import { EDIT_WINDOW_MINUTES } from "@peekpoke/shared";

interface ChatMessageListProps {
  messages: DMMessage[];
  userId: string;
  onDelete: (messageId: string) => void;
  onEdit: (message: DMMessage) => void;
  onReply: (message: DMMessage) => void;
  canReply?: boolean;
  hasOlder?: boolean;
  isLoadingOlder?: boolean;
  onLoadOlder?: () => void;
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

function isWithinEditWindow(msg: DMMessage): boolean {
  return Date.now() - new Date(msg.created_at).getTime() < EDIT_WINDOW_MINUTES * 60 * 1000;
}

export function ChatMessageList({
  messages,
  userId,
  onDelete,
  onEdit,
  onReply,
  canReply = true,
  hasOlder = false,
  isLoadingOlder = false,
  onLoadOlder,
}: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const swipeElRef = useRef<HTMLElement | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; id: string } | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const previousMessageCount = useRef(0);
  const preserveScrollHeight = useRef<number | null>(null);
  const isNearBottom = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => () => clearTimeout(longPressTimer.current), []);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (preserveScrollHeight.current !== null) {
      container.scrollTop += container.scrollHeight - preserveScrollHeight.current;
      preserveScrollHeight.current = null;
    } else if (previousMessageCount.current === 0 || isNearBottom.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: previousMessageCount.current === 0 ? "auto" : "smooth" });
    }
    previousMessageCount.current = messages.length;
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
    const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 100;
    isNearBottom.current = !isFarFromBottom;
    setShowScrollButton(isFarFromBottom);
    if (contextMenu) setContextMenu(null);
  }, [contextMenu]);

  const openContextMenu = useCallback((el: HTMLElement, msg: DMMessage, isOwn: boolean) => {
    if (msg.is_deleted) return;
    setContextMenu({ messageId: msg.id, message: msg, rect: el.getBoundingClientRect(), isOwn });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, msg: DMMessage, isOwn: boolean) => {
    e.preventDefault();
    openContextMenu(e.currentTarget as HTMLElement, msg, isOwn);
  }, [openContextMenu]);

  const resetSwipeEl = useCallback(() => {
    const el = swipeElRef.current;
    if (el) {
      el.style.transform = "";
      el.style.transition = "transform 0.2s ease-out";
      swipeElRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent, msg: DMMessage, isOwn: boolean) => {
    const el = e.currentTarget as HTMLElement;
    const t = e.touches[0];
    swipeStartRef.current = canReply ? { x: t.clientX, y: t.clientY, id: msg.id } : null;
    swipeElRef.current = el;
    longPressTimer.current = setTimeout(() => openContextMenu(el, msg, isOwn), 500);
  }, [canReply, openContextMenu]);

  const handleTouchMove = useCallback((e: React.TouchEvent, msg: DMMessage) => {
    clearTimeout(longPressTimer.current);
    if (!swipeStartRef.current || swipeStartRef.current.id !== msg.id || !swipeElRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - swipeStartRef.current.x;
    const dy = t.clientY - swipeStartRef.current.y;
    if (dx < 0 && Math.abs(dx) > Math.abs(dy) * 0.7) {
      swipeElRef.current.style.transform = `translateX(${Math.max(dx, -64)}px)`;
      swipeElRef.current.style.transition = "none";
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent, msg: DMMessage) => {
    clearTimeout(longPressTimer.current);
    resetSwipeEl();
    if (!swipeStartRef.current || swipeStartRef.current.id !== msg.id) {
      swipeStartRef.current = null;
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStartRef.current.x;
    const dy = t.clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;
    if (canReply && !msg.is_deleted && dx < -50 && Math.abs(dx) > Math.abs(dy)) {
      onReply(msg);
    }
  }, [canReply, resetSwipeEl, onReply]);

  const handleTouchCancel = useCallback(() => {
    clearTimeout(longPressTimer.current);
    resetSwipeEl();
    swipeStartRef.current = null;
  }, [resetSwipeEl]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const scrollToMessage = useCallback((id: string) => {
    const el = messageRefs.current.get(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const getReplyAuthorName = useCallback((senderId: string): string => {
    if (senderId === userId) return "You";
    const m = messages.find((msg) => msg.sender_id === senderId && msg.sender);
    return m?.sender?.display_name || m?.sender?.username || "User";
  }, [messages, userId]);

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto px-4 pb-4 scroll-container overscroll-contain"
        style={{ paddingTop: 12 }}
      >
        {hasOlder || isLoadingOlder ? (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              className="t-caption text-ink-6 disabled:opacity-60"
              disabled={isLoadingOlder}
              onClick={() => {
                if (!onLoadOlder || !containerRef.current) return;
                preserveScrollHeight.current = containerRef.current.scrollHeight;
                onLoadOlder();
              }}
            >
              {isLoadingOlder ? "Loading earlier messages…" : "Load earlier messages"}
            </button>
          </div>
        ) : null}
        {messages.map((msg, i) => {
          const isOwn = msg.sender_id === userId;
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const grouped = prev ? isGrouped(prev, msg) : false;
          const isLastInGroup = !next || !isGrouped(msg, next);

          return (
            <div
              key={msg.id}
              ref={(el) => {
                if (el) messageRefs.current.set(msg.id, el);
                else messageRefs.current.delete(msg.id);
              }}
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
                onTouchMove={(e) => handleTouchMove(e, msg)}
                onTouchEnd={(e) => handleTouchEnd(e, msg)}
                onTouchCancel={handleTouchCancel}
              >
                {msg.reply_to && !msg.is_deleted && (
                  <button type="button"
                    onClick={() => scrollToMessage(msg.reply_to!.id)}
                    className="w-full text-left mb-1.5 rounded px-2 py-1"
                    style={{
                      background: isOwn ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.07)",
                      borderLeft: "2px solid currentColor",
                    }}
                  >
                    <p className="text-xs font-semibold opacity-90 truncate">
                      {getReplyAuthorName(msg.reply_to.sender_id)}
                    </p>
                    <p className="text-[12px] opacity-70 truncate">
                      {msg.reply_to.content || "Message deleted"}
                    </p>
                  </button>
                )}
                {msg.is_deleted ? (
                  <p className="italic opacity-60 text-[15px]">This message was deleted</p>
                ) : (
                  <>
                    {msg.media_url && (
                      <Image src={msg.media_url} alt="" width={800} height={600} className="rounded mb-2 max-w-full" />
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
        <button type="button"
          onClick={scrollToBottom}
          className="iconbtn absolute right-4 shadow-e-1"
          style={{ bottom: 12, width: 36, height: 36 }}
          aria-label="Scroll to bottom"
        >
          <ChevronDown size={18} />
        </button>
      )}

      {contextMenu && typeof document !== "undefined" && createPortal(
        (() => {
          const vh = window.innerHeight;
          const r = contextMenu.rect;
          const isBottomHalf = r.top > vh / 2;
          const ghostTop = isBottomHalf ? vh / 2 - r.height / 2 : r.top;
          const menuTop = ghostTop + r.height + 8;
          const menuAlign = contextMenu.isOwn
            ? { right: window.innerWidth - r.right }
            : { left: r.left };

          const canEdit = contextMenu.isOwn && isWithinEditWindow(contextMenu.message);

          return (
            <>
              <button type="button"
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                onClick={() => setContextMenu(null)}
                tabIndex={0}
                aria-label="Close message menu"
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setContextMenu(null); }}
              />
              <div
                className="fixed z-50 pointer-events-none"
                style={{ top: ghostTop, left: r.left, width: r.width }}
              >
                <div className={cn("w-full px-4 py-2.5", contextMenu.isOwn ? "message-bubble-sent" : "message-bubble-received")} style={{ boxShadow: "none" }}>
                  {contextMenu.message.reply_to && (
                    <div
                      className="w-full text-left mb-1.5 rounded px-2 py-1"
                      style={{
                        background: contextMenu.isOwn ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.07)",
                        borderLeft: "2px solid currentColor",
                      }}
                    >
                      <p className="text-xs font-semibold opacity-90 truncate">
                        {getReplyAuthorName(contextMenu.message.reply_to.sender_id)}
                      </p>
                      <p className="text-[12px] opacity-70 truncate">
                        {contextMenu.message.reply_to.content || "Message deleted"}
                      </p>
                    </div>
                  )}
                  {contextMenu.message.media_url && (
                  <Image src={contextMenu.message.media_url} alt="" width={800} height={600} className="rounded mb-2 max-w-full" />
                  )}
                  <p className="text-[15px] leading-relaxed">{contextMenu.message.content}</p>
                  {contextMenu.message.is_edited && (
                    <p className={cn("text-xs mt-1", contextMenu.isOwn ? "text-white/70" : "muted")}>(edited)</p>
                  )}
                </div>
              </div>
              <div className="fixed z-50" style={{ top: menuTop, ...menuAlign }}>
                <div className="bg-surface rounded-lg border border-hairline overflow-hidden min-w-[180px] shadow-e-2">
                  {canEdit && (
                    <>
                      <button type="button"
                        className="w-full flex items-center gap-3 px-4 py-3 md:hover:bg-ink-1 t-body text-ink-8"
                        onClick={() => { onEdit(contextMenu.message); setContextMenu(null); }}
                      >
                        <Pencil size={18} />Edit
                      </button>
                      <div className="hr" />
                    </>
                  )}
                  <button type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 md:hover:bg-ink-1 t-body text-ink-8"
                    onClick={() => {
                      if (contextMenu.message.content) {
                        navigator.clipboard.writeText(contextMenu.message.content).catch(() => {});
                      }
                      setContextMenu(null);
                    }}
                  >
                    <Copy size={18} />Copy
                  </button>
                  {contextMenu.isOwn && (
                    <>
                      <div className="hr" />
                      <button type="button"
                        className="w-full flex items-center gap-3 px-4 py-3 md:hover:bg-ink-1 t-body text-danger-500"
                        onClick={() => { onDelete(contextMenu.messageId); setContextMenu(null); }}
                      >
                        <Trash2 size={18} />Delete
                      </button>
                    </>
                  )}
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
