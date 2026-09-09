"use client";

import { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { planShareDetails, type Plan } from "@peekpoke/shared";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PlanDetailsShare({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text = open ? planShareDetails(plan) : "";

  async function transfer(copy: boolean) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (copy) {
        await navigator.clipboard.writeText(text);
        setStatus("Details copied. Paste them into a message to someone you trust.");
      } else {
        await navigator.share({ title: plan.title ?? plan.activity, text });
      }
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError")) {
        setError("Could not share the details. Select and copy the preview, or try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!plan.viewer_is_member || plan.status === "cancelled") return null;
  return (
    <>
      <button type="button" className="btn btn-secondary btn-md" disabled={busy} onClick={() => {
        setStatus(null);
        setError(null);
        setOpen(true);
      }}>
        <Share2 size={16} aria-hidden="true" /> Share details
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share plan details</DialogTitle>
            <DialogDescription>Let someone you trust know when and where you&apos;re meeting.</DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words select-text py-3 t-body text-ink-8">{text}</p>
          {status ? <p role="status" className="t-caption text-success-600">{status}</p> : null}
          {error ? <p role="alert" className="t-caption text-danger-500">{error}</p> : null}
          <DialogFooter>
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setOpen(false)}>Done</button>
            <button type="button" className="btn btn-secondary btn-md" disabled={busy} onClick={() => void transfer(true)}>
              <Copy size={16} aria-hidden="true" /> Copy details
            </button>
            {open && typeof navigator.share === "function" ? (
              <button type="button" className="btn btn-primary btn-md" disabled={busy} onClick={() => void transfer(false)}>
                <Share2 size={16} aria-hidden="true" /> Share
              </button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
