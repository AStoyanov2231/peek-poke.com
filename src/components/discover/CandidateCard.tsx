"use client";

import { useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import type { Candidate } from "@/types/database";
import { MapPin, BadgeCheck } from "lucide-react";

interface CandidateCardProps {
  candidate: Candidate;
  isFront: boolean;
  stackOffset: number; // 0 = front, 1 = second, 2 = third
  onPoke: () => Promise<boolean>;
  onPass: () => Promise<boolean>;
}

export function CandidateCard({ candidate, isFront, stackOffset, onPoke, onPass }: CandidateCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-18, 18]);
  const pokeOpacity = useTransform(x, [20, 100], [0, 1]);
  const passOpacity = useTransform(x, [-100, -20], [1, 0]);

  const dragStartX = useRef(0);

  const mainPhoto = candidate.photos.find((p) => p.is_avatar) ?? candidate.photos[0] ?? null;
  const photoUrl = mainPhoto?.url ?? candidate.avatar_url ?? null;

  const displayName = candidate.display_name ?? candidate.username;
  const ageLabel = candidate.age != null ? `, ${candidate.age}` : "";
  const distanceLabel =
    candidate.distance_km > 0 ? `${candidate.distance_km} km away` : null;

  if (!isFront) {
    // Background stack card — static, slightly scaled and offset for depth
    const scale = 1 - stackOffset * 0.05;
    const translateY = stackOffset * 10;
    return (
      <div
        className="absolute inset-0 rounded-3xl overflow-hidden"
        style={{
          transform: `scale(${scale}) translateY(${translateY}px)`,
          zIndex: 10 - stackOffset,
          pointerEvents: "none",
        }}
      >
        <CardInner photoUrl={photoUrl} displayName={displayName} ageLabel={ageLabel} distanceLabel={distanceLabel} candidate={candidate} />
      </div>
    );
  }

  return (
    <motion.div
      className="absolute inset-0 rounded-3xl overflow-hidden cursor-grab active:cursor-grabbing"
      style={{ x, rotate, zIndex: 20, touchAction: "none" }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      onDragStart={(_, info) => { dragStartX.current = info.offset.x; }}
      onDragEnd={(_, info) => {
        const offset = info.offset.x;
        if (offset > 100) {
          void animate(x, 500, { duration: 0.3 }).then(async () => {
            const success = await onPoke();
            if (!success) animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
          });
        } else if (offset < -100) {
          void animate(x, -500, { duration: 0.3 }).then(async () => {
            const success = await onPass();
            if (!success) animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
          });
        } else {
          animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
        }
      }}
    >
      <CardInner photoUrl={photoUrl} displayName={displayName} ageLabel={ageLabel} distanceLabel={distanceLabel} candidate={candidate} />

      {/* Swipe indicators */}
      <motion.div
        className="absolute top-6 left-6 px-4 py-2 rounded-xl border-4 border-emerald-400 text-emerald-400 font-black text-2xl uppercase tracking-wider rotate-[-20deg]"
        style={{ opacity: pokeOpacity }}
      >
        POKE
      </motion.div>
      <motion.div
        className="absolute top-6 right-6 px-4 py-2 rounded-xl border-4 border-rose-400 text-rose-400 font-black text-2xl uppercase tracking-wider rotate-[20deg]"
        style={{ opacity: passOpacity }}
      >
        PASS
      </motion.div>
    </motion.div>
  );
}

interface CardInnerProps {
  photoUrl: string | null;
  displayName: string;
  ageLabel: string;
  distanceLabel: string | null;
  candidate: Candidate;
}

function CardInner({ photoUrl, displayName, ageLabel, distanceLabel, candidate }: CardInnerProps) {
  return (
    <div className="relative w-full h-full bg-ink-2 select-none">
      {/* Photo */}
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={displayName}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "var(--ink-2)" }}
        >
          <span className="text-7xl font-bold text-ink-4">
            {displayName.charAt(0).toUpperCase()}
          </span>
        </div>
      )}

      {/* Gradient overlay */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ height: "55%", background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)" }}
      />

      {/* Info overlay */}
      <div className="absolute bottom-0 inset-x-0 p-5 text-white">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-2xl font-bold leading-tight">
            {displayName}{ageLabel}
          </h2>
          {candidate.verified_at && (
            <BadgeCheck size={20} className="text-sky-400 flex-shrink-0" />
          )}
        </div>
        {distanceLabel && (
          <div className="flex items-center gap-1 text-sm text-white/80">
            <MapPin size={13} />
            {distanceLabel}
          </div>
        )}
        {candidate.bio && (
          <p className="text-sm text-white/70 mt-1 line-clamp-2">{candidate.bio}</p>
        )}
      </div>
    </div>
  );
}
