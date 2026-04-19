"use client";

import { useState } from "react";
import { X, Copy, Check, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface ShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function ShareSheet({ open, onOpenChange, userId }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite/${userId}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-[20px] animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-6 pb-4">
          <h2 className="font-display text-[22px] font-bold text-foreground">Invite Friend</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="w-8 h-8 rounded-full bg-background shadow-neu-raised-sm flex items-center justify-center"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 pb-8 flex flex-col items-center gap-5">
          <div className="p-4 bg-white rounded-xl shadow-neu-raised-sm">
            <QRCodeSVG value={inviteUrl} size={200} />
          </div>
          <p className="text-xs text-muted-foreground text-center break-all px-4">{inviteUrl}</p>
          <div className="flex gap-3 w-full">
            <button
              onClick={handleCopy}
              className="flex-1 h-12 rounded-sm bg-background shadow-neu-raised flex items-center justify-center gap-2 text-[15px] font-medium text-foreground active:shadow-neu-inset transition-shadow"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
            {"share" in navigator && (
              <button
                onClick={() => navigator.share?.({ url: inviteUrl, title: "Join me on Peek & Poke!" })}
                className="flex-1 h-12 rounded-sm bg-primary-gradient text-white shadow-neu-raised-sm flex items-center justify-center gap-2 text-[15px] font-medium active:opacity-90 transition-opacity"
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
