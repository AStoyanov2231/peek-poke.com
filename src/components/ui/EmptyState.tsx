"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateVariant =
  | "no-messages"
  | "no-friends"
  | "no-search-results"
  | "profile-incomplete"
  | "generic";

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const defaultContent: Record<EmptyStateVariant, { title: string; description: string }> = {
  "no-messages": {
    title: "No messages yet",
    description: "Peek & Poke is waiting! Start a conversation with someone nearby.",
  },
  "no-friends": {
    title: "Looking for friends",
    description: "Find people nearby to connect and make friends.",
  },
  "no-search-results": {
    title: "Nothing found",
    description: "Peek & Poke couldn't find anything matching your search.",
  },
  "profile-incomplete": {
    title: "Complete your profile",
    description: "Add more info to help others discover you!",
  },
  "generic": {
    title: "Nothing here yet",
    description: "Check back later for updates.",
  },
};

// Minimalist cat mascot illustrations
function CatIllustration({ variant }: { variant: EmptyStateVariant }) {
  const baseClasses = "w-32 h-32 mx-auto mb-4";

  switch (variant) {
    case "no-messages":
      // Cat looking at empty mailbox
      return (
        <svg viewBox="0 0 120 120" className={baseClasses} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Cat body */}
          <ellipse cx="45" cy="75" rx="25" ry="20" className="fill-cat-pink/20" />
          {/* Cat head */}
          <circle cx="45" cy="50" r="20" className="fill-cat-pink/30" />
          {/* Cat ears */}
          <path d="M28 35 L35 50 L25 50 Z" className="fill-cat-pink/40" />
          <path d="M62 35 L55 50 L65 50 Z" className="fill-cat-pink/40" />
          {/* Cat face */}
          <circle cx="38" cy="48" r="3" className="fill-foreground/60" />
          <circle cx="52" cy="48" r="3" className="fill-foreground/60" />
          <ellipse cx="45" cy="55" rx="2" ry="1.5" className="fill-cat-pink" />
          {/* Whiskers */}
          <path d="M30 52 L20 50 M30 55 L20 56" className="stroke-foreground/40" strokeWidth="1" />
          <path d="M60 52 L70 50 M60 55 L70 56" className="stroke-foreground/40" strokeWidth="1" />
          {/* Mailbox */}
          <rect x="80" y="50" width="25" height="20" rx="2" className="fill-muted stroke-muted-foreground/40" strokeWidth="1.5" />
          <rect x="80" y="50" width="25" height="8" rx="2" className="fill-muted-foreground/20" />
          <rect x="83" y="70" width="5" height="25" className="fill-muted-foreground/30" />
          {/* Cat tail */}
          <path d="M70 75 Q85 65 80 55" className="stroke-cat-pink/40" strokeWidth="4" strokeLinecap="round" fill="none" />
        </svg>
      );

    case "no-friends":
      // Cat with binoculars
      return (
        <svg viewBox="0 0 120 120" className={baseClasses} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Cat body */}
          <ellipse cx="60" cy="80" rx="25" ry="18" className="fill-cat-pink/20" />
          {/* Cat head */}
          <circle cx="60" cy="55" r="22" className="fill-cat-pink/30" />
          {/* Cat ears */}
          <path d="M42 38 L48 52 L38 50 Z" className="fill-cat-pink/40" />
          <path d="M78 38 L72 52 L82 50 Z" className="fill-cat-pink/40" />
          {/* Binoculars */}
          <circle cx="50" cy="52" r="10" className="fill-muted stroke-primary/60" strokeWidth="2" />
          <circle cx="70" cy="52" r="10" className="fill-muted stroke-primary/60" strokeWidth="2" />
          <rect x="57" y="48" width="6" height="8" className="fill-primary/40" />
          {/* Eyes through binoculars */}
          <circle cx="50" cy="52" r="4" className="fill-accent/40" />
          <circle cx="70" cy="52" r="4" className="fill-accent/40" />
          {/* Cat nose */}
          <ellipse cx="60" cy="65" rx="2" ry="1.5" className="fill-cat-pink" />
          {/* Cat tail curled */}
          <path d="M35 80 Q20 70 25 85 Q30 95 40 90" className="stroke-cat-pink/40" strokeWidth="4" strokeLinecap="round" fill="none" />
        </svg>
      );

    case "no-search-results":
      // Cat shrugging
      return (
        <svg viewBox="0 0 120 120" className={baseClasses} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Cat body */}
          <ellipse cx="60" cy="80" rx="22" ry="16" className="fill-cat-pink/20" />
          {/* Cat head */}
          <circle cx="60" cy="50" r="20" className="fill-cat-pink/30" />
          {/* Cat ears */}
          <path d="M43 33 L48 47 L40 45 Z" className="fill-cat-pink/40" />
          <path d="M77 33 L72 47 L80 45 Z" className="fill-cat-pink/40" />
          {/* Cat face - confused expression */}
          <circle cx="52" cy="48" r="2.5" className="fill-foreground/60" />
          <circle cx="68" cy="48" r="2.5" className="fill-foreground/60" />
          <ellipse cx="60" cy="56" rx="2" ry="1.5" className="fill-cat-pink" />
          {/* Confused eyebrows */}
          <path d="M48 42 L55 44" className="stroke-foreground/40" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M72 42 L65 44" className="stroke-foreground/40" strokeWidth="1.5" strokeLinecap="round" />
          {/* Shrugging arms/paws */}
          <ellipse cx="30" cy="65" rx="8" ry="6" className="fill-cat-pink/30" transform="rotate(-20 30 65)" />
          <ellipse cx="90" cy="65" rx="8" ry="6" className="fill-cat-pink/30" transform="rotate(20 90 65)" />
          {/* Question marks */}
          <text x="25" y="50" className="fill-muted-foreground/50 text-lg font-bold">?</text>
          <text x="88" y="50" className="fill-muted-foreground/50 text-lg font-bold">?</text>
        </svg>
      );

    case "profile-incomplete":
      // Cat pointing at checklist
      return (
        <svg viewBox="0 0 120 120" className={baseClasses} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Checklist */}
          <rect x="60" y="35" width="35" height="50" rx="3" className="fill-card stroke-border" strokeWidth="1.5" />
          {/* Checklist items */}
          <rect x="65" y="42" width="6" height="6" rx="1" className="fill-success" />
          <path d="M66 45 L68 47 L71 43" className="stroke-white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="74" y="43" width="16" height="3" rx="1" className="fill-muted-foreground/30" />
          <rect x="65" y="54" width="6" height="6" rx="1" className="fill-success" />
          <path d="M66 57 L68 59 L71 55" className="stroke-white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="74" y="55" width="16" height="3" rx="1" className="fill-muted-foreground/30" />
          <rect x="65" y="66" width="6" height="6" rx="1" className="stroke-muted-foreground/40" strokeWidth="1.5" fill="none" />
          <rect x="74" y="67" width="16" height="3" rx="1" className="fill-muted-foreground/30" />
          {/* Cat body */}
          <ellipse cx="35" cy="82" rx="18" ry="14" className="fill-cat-pink/20" />
          {/* Cat head */}
          <circle cx="35" cy="55" r="18" className="fill-cat-pink/30" />
          {/* Cat ears */}
          <path d="M20 40 L26 52 L18 50 Z" className="fill-cat-pink/40" />
          <path d="M50 40 L44 52 L52 50 Z" className="fill-cat-pink/40" />
          {/* Cat face */}
          <circle cx="28" cy="53" r="2.5" className="fill-foreground/60" />
          <circle cx="42" cy="53" r="2.5" className="fill-foreground/60" />
          <ellipse cx="35" cy="60" rx="2" ry="1.5" className="fill-cat-pink" />
          {/* Pointing paw */}
          <ellipse cx="55" cy="60" rx="6" ry="4" className="fill-cat-pink/30" transform="rotate(-10 55 60)" />
        </svg>
      );

    default:
      // Generic sitting cat
      return (
        <svg viewBox="0 0 120 120" className={baseClasses} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Cat body */}
          <ellipse cx="60" cy="78" rx="25" ry="18" className="fill-cat-pink/20" />
          {/* Cat head */}
          <circle cx="60" cy="48" r="22" className="fill-cat-pink/30" />
          {/* Cat ears */}
          <path d="M42 30 L48 44 L38 42 Z" className="fill-cat-pink/40" />
          <path d="M78 30 L72 44 L82 42 Z" className="fill-cat-pink/40" />
          {/* Inner ears */}
          <path d="M44 34 L48 42 L42 41 Z" className="fill-cat-pink/60" />
          <path d="M76 34 L72 42 L78 41 Z" className="fill-cat-pink/60" />
          {/* Cat face */}
          <circle cx="52" cy="46" r="3" className="fill-foreground/60" />
          <circle cx="68" cy="46" r="3" className="fill-foreground/60" />
          <ellipse cx="60" cy="54" rx="2.5" ry="2" className="fill-cat-pink" />
          {/* Mouth */}
          <path d="M60 56 L57 60 M60 56 L63 60" className="stroke-foreground/30" strokeWidth="1" strokeLinecap="round" />
          {/* Whiskers */}
          <path d="M45 52 L32 50 M45 55 L32 57" className="stroke-foreground/30" strokeWidth="1" />
          <path d="M75 52 L88 50 M75 55 L88 57" className="stroke-foreground/30" strokeWidth="1" />
          {/* Tail */}
          <path d="M85 78 Q100 70 95 85 Q90 95 80 90" className="stroke-cat-pink/40" strokeWidth="5" strokeLinecap="round" fill="none" />
          {/* Paws */}
          <ellipse cx="45" cy="92" rx="8" ry="5" className="fill-cat-pink/25" />
          <ellipse cx="75" cy="92" rx="8" ry="5" className="fill-cat-pink/25" />
        </svg>
      );
  }
}

export function EmptyState({
  variant = "generic",
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  const content = defaultContent[variant];
  const displayTitle = title ?? content.title;
  const displayDescription = description ?? content.description;

  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
      <CatIllustration variant={variant} />

      <h3 className="text-lg font-semibold text-foreground mb-2">
        {displayTitle}
      </h3>

      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        {displayDescription}
      </p>

      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          variant="primary"
          className="btn-press"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
