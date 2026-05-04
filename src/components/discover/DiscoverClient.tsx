"use client";

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Heart, X, Star, MapPin, Loader2 } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import {
  useUserLocation,
  useCurrentCandidate,
  useCurrentCandidateIndex,
  useCandidates,
  useDailyPokesRemaining,
  useLastMatch,
  useLastMatchCandidate,
  useIsCandidatesLoaded,
} from "@/stores/selectors";
import { CandidateCard } from "./CandidateCard";
import { MatchOverlay } from "./MatchOverlay";
import { QuotaBadge } from "./QuotaBadge";

export function DiscoverClient() {
  const userLocation = useUserLocation();
  const candidates = useCandidates();
  const currentIndex = useCurrentCandidateIndex();
  const currentCandidate = useCurrentCandidate();
  const dailyPokesRemaining = useDailyPokesRemaining();
  const lastMatch = useLastMatch();
  const lastMatchCandidate = useLastMatchCandidate();
  const isCandidatesLoaded = useIsCandidatesLoaded();

  const { fetchCandidates, poke, pass, superPoke, dismissMatch } = useAppStore.getState();

  useEffect(() => {
    if (userLocation) {
      fetchCandidates();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation?.lat, userLocation?.lng]);

  if (!userLocation) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
        <div
          className="flex items-center justify-center w-16 h-16 rounded-full"
          style={{ background: "var(--ink-1)" }}
        >
          <MapPin size={28} style={{ color: "var(--primary-500)" }} />
        </div>
        <h2 className="text-xl font-bold text-ink-9">Enable location</h2>
        <p className="text-sm text-ink-5">
          We need your location to show you people nearby. Enable location access in your browser settings.
        </p>
      </div>
    );
  }

  if (!isCandidatesLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--primary-500)" }} />
      </div>
    );
  }

  const isDeckEmpty = isCandidatesLoaded && currentIndex >= candidates.length;

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <h1 className="text-xl font-bold text-ink-9">Discover</h1>
        <QuotaBadge remaining={dailyPokesRemaining} />
      </div>

      {/* Card deck */}
      <div className="flex-1 relative mx-4 mb-4">
        {isDeckEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div
              className="flex items-center justify-center w-16 h-16 rounded-full"
              style={{ background: "var(--ink-1)" }}
            >
              <Heart size={28} style={{ color: "var(--ink-4)" }} />
            </div>
            <h2 className="text-xl font-bold text-ink-9">You&apos;re all caught up!</h2>
            <p className="text-sm text-ink-5">Check back later for more people near you.</p>
          </div>
        ) : (
          // Render up to 3 cards: front + 2 behind for depth
          [2, 1, 0].map((offset) => {
            const idx = currentIndex + offset;
            const candidate = candidates[idx];
            if (!candidate) return null;
            return (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                isFront={offset === 0}
                stackOffset={offset}
                onPoke={() => poke(candidate.id)}
                onPass={() => pass(candidate.id)}
              />
            );
          })
        )}
      </div>

      {/* Action buttons */}
      {!isDeckEmpty && currentCandidate && (
        <div className="flex items-center justify-center gap-5 pb-6 flex-shrink-0">
          {/* Pass */}
          <button
            aria-label="Pass"
            onClick={() => void pass(currentCandidate.id)}
            className="flex items-center justify-center rounded-full border-2 transition-transform active:scale-95"
            style={{
              width: 60,
              height: 60,
              borderColor: "var(--ink-3)",
              background: "var(--surface)",
              boxShadow: "var(--e-1)",
            }}
          >
            <X size={26} style={{ color: "var(--ink-6)" }} />
          </button>

          {/* Super Poke */}
          <button
            aria-label="Super Poke"
            onClick={() => void superPoke(currentCandidate.id)}
            className="flex items-center justify-center rounded-full border-2 transition-transform active:scale-95"
            style={{
              width: 52,
              height: 52,
              borderColor: "oklch(0.78 0.18 85)",
              background: "var(--surface)",
              boxShadow: "var(--e-1)",
            }}
          >
            <Star size={22} style={{ color: "oklch(0.65 0.18 85)" }} />
          </button>

          {/* Poke / Heart */}
          <button
            aria-label="Poke"
            onClick={() => void poke(currentCandidate.id)}
            className="flex items-center justify-center rounded-full border-2 transition-transform active:scale-95"
            style={{
              width: 60,
              height: 60,
              borderColor: "var(--primary-500)",
              background: "var(--primary-500)",
              boxShadow: "var(--e-1)",
            }}
          >
            <Heart size={26} className="text-white" fill="white" />
          </button>
        </div>
      )}

      {/* Match overlay */}
      <AnimatePresence>
        {lastMatch && lastMatchCandidate && (
          <MatchOverlay
            match={lastMatch}
            candidate={lastMatchCandidate}
            onDismiss={dismissMatch}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
