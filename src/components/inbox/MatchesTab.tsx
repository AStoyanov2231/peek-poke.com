"use client";

import { useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { useMatches, useIsMatchesLoaded } from "@/stores/selectors";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MatchCountdownBadge } from "./MatchCountdownBadge";

interface MatchesTabProps {
  onSelectThread: (threadId: string) => void;
  activeThreadId: string | null;
}

export function MatchesTab({ onSelectThread, activeThreadId }: MatchesTabProps) {
  const router = useTransitionRouter();
  const matches = useMatches();
  const isLoaded = useIsMatchesLoaded();
  const fetchMatches = useAppStore((s) => s.fetchMatches);
  const removeMatch = useAppStore((s) => s.removeMatch);

  useEffect(() => {
    if (!isLoaded) fetchMatches();
  }, [isLoaded, fetchMatches]);

  const handleThreadClick = (threadId: string) => {
    if (window.innerWidth < 768) {
      router.push(`/chat/${threadId}`);
    } else {
      onSelectThread(threadId);
    }
  };

  const handleUnmatch = async (matchId: string) => {
    removeMatch(matchId); // optimistic
    await fetch(`/api/dating/matches/${matchId}/unmatch`, { method: "POST" });
  };

  if (!isLoaded) {
    return (
      <div className="px-3 space-y-1 pt-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center px-8">
        <p className="t-body muted">No matches yet</p>
        <p className="t-caption muted mt-1">Poke someone back to match</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      {matches.map((match) => {
        const name = match.partner.display_name ?? match.partner.username;
        const isActive = match.thread_id === activeThreadId;

        return (
          <div
            key={match.id}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-3 transition-all rounded-xl",
              isActive ? "bg-ink-1" : "md:hover:bg-ink-1"
            )}
          >
            <button
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
              onClick={() => match.thread_id && handleThreadClick(match.thread_id)}
            >
              <Avatar className="h-[52px] w-[52px] flex-shrink-0">
                <AvatarImage src={match.partner.avatar_url ?? undefined} alt={name} />
                <AvatarFallback name={name} />
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="t-body-b truncate text-ink-9">{name}</p>
                <MatchCountdownBadge expiresAt={match.expires_at} />
              </div>
            </button>
            <button
              className="flex-shrink-0 p-2 rounded-full md:hover:bg-ink-2 transition-colors"
              onClick={() => handleUnmatch(match.id)}
              aria-label="Unmatch"
            >
              <span className="t-caption muted">✕</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
