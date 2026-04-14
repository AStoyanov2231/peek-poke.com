"use client";

import { useState } from "react";
import { X, ChevronRight, ChevronLeft, LogOut, CircleHelp, FileText } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Card } from "@/components/ui/card";

type View = "main" | "help" | "terms";

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const [view, setView] = useState<View>("main");

  const handleClose = () => {
    setView("main");
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40" onClick={handleClose} />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-[20px] max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-4">
          {view !== "main" ? (
            <button
              onClick={() => setView("main")}
              className="w-8 h-8 rounded-full bg-background shadow-neu-raised-sm flex items-center justify-center"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : (
            <h2 className="font-display text-[22px] font-bold text-foreground">Settings</h2>
          )}
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-background shadow-neu-raised-sm flex items-center justify-center"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {view === "main" && <MainView onNavigate={setView} />}
        {view === "help" && <HelpView />}
        {view === "terms" && <TermsView />}
      </div>
    </>
  );
}

function MainView({ onNavigate }: { onNavigate: (v: View) => void }) {
  return (
    <div className="px-6 pb-8 flex flex-col gap-4">
      {/* Support section */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Support</span>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => onNavigate("help")}
            className="flex items-center gap-3 h-[52px] px-4 bg-background shadow-neu-raised rounded-sm active:shadow-neu-inset transition-shadow"
          >
            <CircleHelp className="h-[18px] w-[18px] text-primary" />
            <span className="flex-1 text-left text-[15px] font-medium text-foreground">Help Center</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => onNavigate("terms")}
            className="flex items-center gap-3 h-[52px] px-4 bg-background shadow-neu-raised rounded-sm active:shadow-neu-inset transition-shadow"
          >
            <FileText className="h-[18px] w-[18px] text-primary" />
            <span className="flex-1 text-left text-[15px] font-medium text-foreground">Terms & Privacy</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Log out */}
      <div className="pt-2">
        <form action={signOut}>
          <button
            type="submit"
            className="w-full h-12 rounded-sm bg-background shadow-neu-raised text-[15px] font-medium text-muted-foreground active:shadow-neu-inset transition-shadow"
          >
            Log Out
          </button>
        </form>
      </div>

      {/* Version */}
      <p className="text-center text-xs text-muted-foreground pt-1">Peek &amp; Poke v2.1.0</p>
    </div>
  );
}

function HelpView() {
  const faqs = [
    {
      q: "How do I find people nearby?",
      a: "Open the map on the home screen. Pins show users who are currently sharing their location near you.",
    },
    {
      q: "How do I send a friend request?",
      a: "Tap on a pin or visit a user's profile, then tap 'Add Friend'. They'll receive a request in their inbox.",
    },
    {
      q: "What is Premium?",
      a: "Premium unlocks private photo access and other exclusive features. Upgrade from your profile page.",
    },
    {
      q: "How do I change my avatar?",
      a: "Go to your profile, tap any photo in the gallery, and select 'Set as avatar'.",
    },
    {
      q: "How do I delete my account?",
      a: "Contact us at support@peekandpoke.app and we'll process your request within 48 hours.",
    },
  ];

  return (
    <div className="px-6 pb-8 flex flex-col gap-3">
      <h3 className="font-display text-[18px] font-bold text-foreground">Help Center</h3>
      {faqs.map(({ q, a }) => (
        <Card key={q} className="rounded-sm p-4 flex flex-col gap-1.5">
          <p className="text-[14px] font-semibold text-foreground">{q}</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{a}</p>
        </Card>
      ))}
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
        <a
          href="https://peekandpoke.app/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-primary font-medium mt-1"
        >
          Read full Terms of Service →
        </a>
      </Card>
      <Card className="rounded-sm p-4 flex flex-col gap-2">
        <p className="text-[14px] font-semibold text-foreground">Privacy Policy</p>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          We collect only the data needed to provide the Peek &amp; Poke service. Your location is only shared when you choose to enable it. We never sell your data.
        </p>
        <a
          href="https://peekandpoke.app/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-primary font-medium mt-1"
        >
          Read full Privacy Policy →
        </a>
      </Card>
    </div>
  );
}
