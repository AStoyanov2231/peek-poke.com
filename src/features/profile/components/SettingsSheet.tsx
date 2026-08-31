"use client";

import { useState } from "react";
import { X, ChevronRight, ChevronLeft, CircleHelp, FileText, Trash2 } from "lucide-react";
import { signOut } from "@/features/auth/actions";
import { Card } from "@/components/ui/card";
import { useCallStore } from "@/stores/callStore";

type View = "main" | "help" | "terms" | "delete";

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const [view, setView] = useState<View>("main");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleClose = () => {
    if (deleting) return;
    setView("main");
    setDeleteError(null);
    onOpenChange(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      if (!response.ok) throw new Error("We couldn't delete your account. Please try again.");
      useCallStore.getState().observeAccount(null);
      window.location.assign("/login");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "We couldn't delete your account. Please try again.");
      setDeleting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-50 bg-black/40" aria-label="Close settings" onClick={handleClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-[20px] max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-6 pb-4">
          {view !== "main" ? (
            <button type="button"
              onClick={() => setView("main")}
              aria-label="Back to settings"
              className="w-8 h-8 rounded-full bg-background shadow-e-1 flex items-center justify-center"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : (
            <h2 className="font-display text-[22px] font-bold text-foreground">Settings</h2>
          )}
          <button type="button"
            onClick={handleClose}
            aria-label="Close settings"
            className="w-8 h-8 rounded-full bg-background shadow-e-1 flex items-center justify-center"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {view === "main" && <MainView onNavigate={setView} />}
        {view === "help" && <HelpView />}
        {view === "terms" && <TermsView />}
        {view === "delete" && (
          <DeleteAccountView
            deleting={deleting}
            error={deleteError}
            onCancel={() => setView("main")}
            onDelete={handleDeleteAccount}
          />
        )}
      </div>
    </>
  );
}

function MainView({ onNavigate }: { onNavigate: (v: View) => void }) {
  return (
    <div className="px-6 pb-8 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Support</span>
        <div className="flex flex-col gap-1.5">
          <button type="button"
            onClick={() => onNavigate("help")}
            className="flex items-center gap-3 h-[52px] px-4 bg-background shadow-e-2 rounded-sm active: transition-shadow"
          >
            <CircleHelp className="h-[18px] w-[18px] text-primary" />
            <span className="flex-1 text-left text-[15px] font-medium text-foreground">Help Center</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button type="button"
            onClick={() => onNavigate("terms")}
            className="flex items-center gap-3 h-[52px] px-4 bg-background shadow-e-2 rounded-sm active: transition-shadow"
          >
            <FileText className="h-[18px] w-[18px] text-primary" />
            <span className="flex-1 text-left text-[15px] font-medium text-foreground">Terms & Privacy</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="pt-2">
        <button type="button"
          onClick={() => {
            useCallStore.getState().observeAccount(null);
            void signOut();
          }}
          className="w-full h-12 rounded-sm bg-background shadow-e-2 text-[15px] font-medium text-muted-foreground active: transition-shadow"
        >
          Log Out
        </button>
      </div>

      <button type="button"
        onClick={() => onNavigate("delete")}
        className="flex items-center justify-center gap-2 h-12 rounded-sm bg-red-50 text-[15px] font-semibold text-red-700"
      >
        <Trash2 className="h-4 w-4" /> Delete Account
      </button>

      <p className="text-center text-xs text-muted-foreground pt-1">
        Peek &amp; Poke v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0"}
      </p>
    </div>
  );
}

const FAQS = [
    {
      q: "How do I join a conversation?",
      a: "Scan a room QR code from the Rooms screen. Everyone who scans the same code joins the same group chat."
    },
    {
      q: "How do I invite my crew?",
      a: "Create a room QR code and let your crew scan it. Room membership is preserved when you return."
    },
    {
      q: "What is Premium?",
      a: "Premium unlocks private photo access and other exclusive features. Upgrade from your profile page.",
    },
    {
      q: "How do I change my avatar?",
      a: "Go to your profile, tap any photo in the gallery, and select Set as avatar.",
    },
    {
      q: "How do I delete my account?",
      a: "Open Settings, choose Delete Account, and confirm. Your app account and personal content are erased. App Store and Google Play subscriptions must be canceled separately.",
    },
];

function HelpView() {

  return (
    <div className="px-6 pb-8 flex flex-col gap-3">
      <h3 className="font-display text-[18px] font-bold text-foreground">Help Center</h3>
      {FAQS.map(({ q, a }) => (
        <Card key={q} className="rounded-sm p-4 flex flex-col gap-1.5">
          <p className="text-[14px] font-semibold text-foreground">{q}</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{a}</p>
        </Card>
      ))}
    </div>
  );
}

function DeleteAccountView({
  deleting,
  error,
  onCancel,
  onDelete,
}: {
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="px-6 pb-8 flex flex-col gap-4">
      <h3 className="font-display text-[18px] font-bold text-foreground">Delete Account</h3>
      <Card className="rounded-sm p-4 flex flex-col gap-2 border-red-200 bg-red-50">
        <p className="text-[14px] font-semibold text-red-800">This action cannot be undone.</p>
        <p className="text-[13px] text-red-700 leading-relaxed">
          Your personal profile, photos, authored messages, billing identifiers, and sign-in account will be erased. Shared conversations retain only an anonymous deleted-member placeholder and minimal safety records.
        </p>
        <p className="text-[13px] text-red-700 leading-relaxed">
          App Store and Google Play subscriptions are not canceled by deleting your account. Cancel them in the store first. A web subscription billed by Stripe is canceled immediately.
        </p>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        <a
          className="h-11 rounded-sm bg-background shadow-e-2 text-[13px] font-medium text-foreground flex items-center justify-center"
          href="https://apps.apple.com/account/subscriptions"
          rel="noopener noreferrer"
          target="_blank"
        >
          App Store
        </a>
        <a
          className="h-11 rounded-sm bg-background shadow-e-2 text-[13px] font-medium text-foreground flex items-center justify-center"
          href="https://play.google.com/store/account/subscriptions"
          rel="noopener noreferrer"
          target="_blank"
        >
          Google Play
        </a>
      </div>
      {error ? <p role="alert" className="text-[13px] text-red-700">{error}</p> : null}
      <button
        type="button"
        disabled={deleting}
        onClick={onDelete}
        className="w-full h-12 rounded-sm bg-red-700 text-[15px] font-semibold text-white disabled:opacity-60"
      >
        {deleting ? "Deleting…" : "Delete My Account"}
      </button>
      <button
        type="button"
        disabled={deleting}
        onClick={onCancel}
        className="w-full h-12 rounded-sm bg-background shadow-e-2 text-[15px] font-medium text-foreground disabled:opacity-60"
      >
        Keep My Account
      </button>
    </div>
  );
}

function TermsView() {
  return (
    <div className="px-6 pb-8 flex flex-col gap-4">
      <h3 className="font-display text-[18px] font-bold text-foreground">Terms & Privacy</h3>
      <Card className="rounded-sm p-4 flex flex-col gap-2">
        <p className="text-[14px] font-semibold text-foreground">Terms of Service</p>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          By using Peek &amp; Poke you agree to our terms of service. We may update these terms from time to time and will notify you of significant changes.
        </p>
      </Card>
      <Card className="rounded-sm p-4 flex flex-col gap-2">
        <p className="text-[14px] font-semibold text-foreground">Privacy Policy</p>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          We collect only the data needed to provide the Peek &amp; Poke service. Room QR codes are stored as one-way capabilities. We never sell your data.
        </p>
      </Card>
    </div>
  );
}
