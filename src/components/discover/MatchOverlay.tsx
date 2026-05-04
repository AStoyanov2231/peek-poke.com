"use client";

import { motion } from "framer-motion";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";
import type { Match, Candidate } from "@/types/database";

interface MatchOverlayProps {
  match: Match;
  candidate: Candidate;
  onDismiss: () => void;
}

export function MatchOverlay({ match, candidate, onDismiss }: MatchOverlayProps) {
  const router = useTransitionRouter();
  const displayName = candidate.display_name ?? candidate.username;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
      style={{ background: "linear-gradient(135deg, oklch(0.45 0.25 310) 0%, oklch(0.55 0.28 350) 100%)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.h1
        className="text-4xl font-black text-white mb-2 text-center"
        style={{ letterSpacing: "-0.02em" }}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 12, stiffness: 180, delay: 0.1 }}
      >
        It&apos;s a Match!
      </motion.h1>
      <motion.p
        className="text-white/80 text-center mb-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        You and {displayName} poked each other
      </motion.p>

      {/* Avatars */}
      <motion.div
        className="flex items-center gap-6 mb-12"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", damping: 15 }}
      >
        <MatchAvatar
          photoUrl={null}
          name="You"
          delay={0.3}
        />
        <span className="text-4xl">💫</span>
        <MatchAvatar
          photoUrl={candidate.photos[0]?.url ?? candidate.avatar_url ?? null}
          name={displayName}
          delay={0.4}
        />
      </motion.div>

      {/* Actions */}
      <motion.div
        className="flex flex-col gap-3 w-full max-w-xs"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {match.thread_id && (
          <button
            onClick={() => {
              onDismiss();
              router.push(`/chat/${match.thread_id}`);
            }}
            className="w-full h-13 rounded-full font-semibold text-base text-[oklch(0.45_0.25_310)] bg-white"
            style={{ height: 52 }}
          >
            Start chatting
          </button>
        )}
        <button
          onClick={onDismiss}
          className="w-full h-13 rounded-full font-medium text-base text-white border-2 border-white/40"
          style={{ height: 52, background: "transparent" }}
        >
          Keep swiping
        </button>
      </motion.div>
    </motion.div>
  );
}

function MatchAvatar({ photoUrl, name, delay }: { photoUrl: string | null; name: string; delay: number }) {
  return (
    <motion.div
      className="relative"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", damping: 12, stiffness: 200, delay }}
    >
      {/* Animated ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: "rgba(255,255,255,0.4)" }}
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-white"
        style={{ background: "rgba(255,255,255,0.2)" }}
      >
        {photoUrl ? (
          <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-3xl font-bold text-white">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
