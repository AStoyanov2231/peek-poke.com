"use client";

import { useEffect, useState } from "react";
import { X, Copy, Check, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { fetchInviteLink } from "@/data/invites";

interface ShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareSheet({ open, onOpenChange }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetchInviteLink(controller.signal)
      .then((payload) => {
        setInviteUrl(payload.invite_url);
        setInviteError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setInviteError(error instanceof Error ? error.message : "Invite links are unavailable.");
      });
    return () => controller.abort();
  }, [open]);

  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (!inviteUrl) return;
    navigator.share?.({ url: inviteUrl, title: "Join me on Peek & Poke!" });
  };

  if (!open) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-50 bg-black/40" aria-label="Close share sheet" onClick={() => onOpenChange(false)} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-[20px] animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-6 pb-4">
          <h2 className="font-display text-[22px] font-bold text-foreground">Invite Friend</h2>
          <button type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close share sheet"
            className="w-8 h-8 rounded-full bg-background shadow-e-1 flex items-center justify-center"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 pb-8 flex flex-col items-center gap-5">
          {inviteUrl ? (
            <div className="p-4 bg-white rounded-xl shadow-e-1">
              <QRCodeSVG value={inviteUrl} size={200} />
            </div>
          ) : (
            <div className="h-[232px] w-[232px] rounded-xl bg-muted animate-pulse" />
          )}
          <p role={inviteError ? "alert" : undefined} className="min-h-4 text-xs text-muted-foreground text-center break-all px-4">
            {inviteError ?? inviteUrl ?? "Creating a secure invite…"}
          </p>
          <div className="flex gap-3 w-full">
            <button type="button"
              onClick={handleCopy}
              disabled={!inviteUrl}
              className="flex-1 h-12 rounded-sm bg-background shadow-e-2 flex items-center justify-center gap-2 text-[15px] font-medium text-foreground active: transition-shadow"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
            {canShare && (
              <button type="button"
                onClick={handleShare}
                disabled={!inviteUrl}
                className="flex-1 h-12 rounded-sm bg-ink-9 text-white shadow-e-1 flex items-center justify-center gap-2 text-[15px] font-medium active:opacity-90 transition-opacity"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
