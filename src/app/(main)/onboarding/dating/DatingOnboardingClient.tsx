"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Check,
  RefreshCw,
  Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MIN_DATING_PHOTOS, FREE_DISTANCE_KM, MIN_AGE } from "@/lib/constants";
import type { DatingPreferences, GenderIdentity } from "@/types/database";

type DatingOnboardingClientProps = {
  profile: {
    date_of_birth: string | null;
    gender: string | null;
    orientation: string | null;
    height_cm: number | null;
    relationship_goal: string | null;
    smoking: string | null;
    drinking: string | null;
    has_kids: string | null;
  };
  approvedPhotoCount: number;
  existingPreferences: DatingPreferences | null;
};

const TOTAL_STEPS = 6;

const stepVariants = {
  enter: { opacity: 0, scale: 0.97 },
  center: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: "easeOut" as const } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.2, ease: "easeIn" as const } },
};

const shakeVariants = {
  shake: { x: [-10, 8, -6, 4, 0], transition: { duration: 0.4 } },
};

function ShakeError({ message, className }: { message: string; className?: string }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div variants={shakeVariants} animate="shake" exit={{ opacity: 0, height: 0 }} className={className}>
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm bg-[var(--danger-50,oklch(0.97_0.02_27))] text-[var(--danger-600,oklch(0.55_0.18_27))]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type ToggleButtonProps = {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
};

function ToggleButton({ label, selected, onClick, disabled }: ToggleButtonProps) {
  return (
    <motion.button
      whileTap={!disabled ? { scale: 0.93 } : {}}
      animate={selected ? { scale: 1.03 } : { scale: 1 }}
      transition={{ type: "spring" as const, damping: 20, stiffness: 300 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-4 py-2.5 text-sm rounded-full border transition-all duration-200",
        selected
          ? "bg-ink-9 text-white border-ink-9 shadow-e-1"
          : "bg-[var(--surface)] border-[var(--ink-3)] text-ink-9",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {label}
    </motion.button>
  );
}

function computeInitialStep(
  profile: DatingOnboardingClientProps["profile"],
  existingPreferences: DatingPreferences | null,
  approvedPhotoCount: number
): number {
  if (!profile.date_of_birth) return 1;
  if (!profile.gender || !profile.orientation || !profile.relationship_goal) return 2;
  if (!existingPreferences) return 3;
  if (approvedPhotoCount < MIN_DATING_PHOTOS) return 4;
  return 5;
}

export function DatingOnboardingClient({
  profile,
  approvedPhotoCount: initialApprovedCount,
  existingPreferences,
}: DatingOnboardingClientProps) {
  const router = useRouter();

  const [step, setStep] = useState(() =>
    computeInitialStep(profile, existingPreferences, initialApprovedCount)
  );

  // Step 1 — DOB
  const [dob, setDob] = useState(profile.date_of_birth ?? "");

  // Step 2 — Identity
  const [gender, setGender] = useState(profile.gender ?? "");
  const [orientation, setOrientation] = useState(profile.orientation ?? "");
  const [heightCm, setHeightCm] = useState<string>(
    profile.height_cm != null ? String(profile.height_cm) : ""
  );
  const [relationshipGoal, setRelationshipGoal] = useState(profile.relationship_goal ?? "");

  // Step 3 — Preferences
  const [interestedIn, setInterestedIn] = useState<GenderIdentity[]>(
    existingPreferences?.interested_in ?? []
  );
  const [minAge, setMinAge] = useState(existingPreferences?.min_age ?? MIN_AGE);
  const [maxAge, setMaxAge] = useState(existingPreferences?.max_age ?? 45);
  const [maxDistance, setMaxDistance] = useState(
    existingPreferences?.max_distance_km ?? FREE_DISTANCE_KM
  );

  // Step 4 — Dealbreakers
  const [dealbreakerSmoking, setDealbreakerSmoking] = useState(
    existingPreferences?.dealbreaker_smoking ?? false
  );
  const [dealbreakerDrinking, setDealbreakerDrinking] = useState(
    existingPreferences?.dealbreaker_drinking ?? false
  );
  const [dealbreakerKids, setDealbreakerKids] = useState(
    existingPreferences?.dealbreaker_kids ?? false
  );
  const [dealbreakerGoal, setDealbreakerGoal] = useState<string>(
    existingPreferences?.dealbreaker_relationship_goal ?? ""
  );
  const [verifiedOnly, setVerifiedOnly] = useState(
    existingPreferences?.verified_only ?? false
  );
  const [womenOnly, setWomenOnly] = useState(
    existingPreferences?.women_only ?? false
  );

  // Step 5 — Photos
  const [approvedCount, setApprovedCount] = useState(initialApprovedCount);
  const [refreshingPhotos, setRefreshingPhotos] = useState(false);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Max DOB for 18+ rule
  const maxDobDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - MIN_AGE);
    return d.toISOString().split("T")[0];
  })();

  const refreshPhotoCount = useCallback(async () => {
    setRefreshingPhotos(true);
    try {
      const res = await fetch("/api/profile/photos");
      if (!res.ok) return;
      const data = await res.json();
      const photos: Array<{ approval_status: string }> = Array.isArray(data?.photos) ? data.photos : [];
      setApprovedCount(photos.filter((p) => p.approval_status === "approved").length);
    } catch {
      // network error — keep existing count
    } finally {
      setRefreshingPhotos(false);
    }
  }, []);

  useEffect(() => {
    if (step === 5) {
      refreshPhotoCount();
    }
  }, [step, refreshPhotoCount]);

  const progressPercent = ((step - 1) / (TOTAL_STEPS - 1)) * 100;

  const goBack = () => {
    setError("");
    setStep((s) => Math.max(1, s - 1));
  };

  // Step 1 submit: PATCH date_of_birth
  const handleStep1 = async () => {
    if (!dob) {
      setError("Please enter your date of birth");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date_of_birth: dob }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to save date of birth");
        return;
      }
      setStep(2);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2 submit: PATCH gender, orientation, height_cm, relationship_goal
  const handleStep2 = async () => {
    if (!gender) {
      setError("Please select your gender");
      return;
    }
    if (!orientation) {
      setError("Please select your orientation");
      return;
    }
    if (!relationshipGoal) {
      setError("Please select your relationship goal");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender,
          orientation,
          height_cm: heightCm ? parseInt(heightCm, 10) : null,
          relationship_goal: relationshipGoal,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to save identity");
        return;
      }
      setStep(3);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 3 → advance to step 4 (no API call yet)
  const handleStep3 = () => {
    if (interestedIn.length === 0) {
      setError("Please select at least one gender you're interested in");
      return;
    }
    if (minAge >= maxAge) {
      setError("Min age must be less than max age");
      return;
    }
    setError("");
    setStep(4);
  };

  // Step 4 submit: PUT dating preferences (covers both steps 3 + 4)
  const handleStep4 = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dating/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interested_in: interestedIn,
          min_age: minAge,
          max_age: maxAge,
          max_distance_km: maxDistance,
          dealbreaker_smoking: dealbreakerSmoking,
          dealbreaker_drinking: dealbreakerDrinking,
          dealbreaker_kids: dealbreakerKids,
          dealbreaker_relationship_goal: dealbreakerGoal || null,
          verified_only: verifiedOnly,
          women_only: womenOnly,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to save preferences");
        return;
      }
      setStep(5);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 5 → step 6 (photos already validated by count)
  const handleStep5 = () => {
    if (approvedCount < MIN_DATING_PHOTOS) {
      setError(`You need at least ${MIN_DATING_PHOTOS} approved photos to continue`);
      return;
    }
    setError("");
    setStep(6);
  };

  // Step 6 submit: complete dating onboarding
  const handleStep6 = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/profile/complete-dating-onboarding", {
        method: "POST",
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to complete onboarding");
        return;
      }
      router.replace("/");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const continueButton = (onClick: () => void, disabled?: boolean, label = "Continue") => (
    <motion.button
      whileHover={!disabled && !loading ? { scale: 1.02 } : {}}
      whileTap={!disabled && !loading ? { scale: 0.97 } : {}}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "flex-1 h-12 rounded-full font-semibold flex items-center justify-center gap-2 transition-all duration-300",
        !disabled && !loading
          ? "bg-ink-9 text-white shadow-e-1 cursor-pointer"
          : "bg-ink-2 text-ink-4 cursor-not-allowed"
      )}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <>
          {label}
          <ArrowRight className="h-5 w-5" />
        </>
      )}
    </motion.button>
  );

  const backButton = (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={goBack}
      disabled={loading}
      className="h-12 px-5 rounded-full font-medium flex items-center justify-center gap-2 bg-[var(--surface)] shadow-e-2 text-ink-6"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </motion.button>
  );

  const GENDER_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "man", label: "Man" },
    { value: "woman", label: "Woman" },
    { value: "non_binary", label: "Non-binary" },
    { value: "other", label: "Other" },
  ];

  const ORIENTATION_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "straight", label: "Straight" },
    { value: "gay", label: "Gay" },
    { value: "lesbian", label: "Lesbian" },
    { value: "bisexual", label: "Bisexual" },
    { value: "pansexual", label: "Pansexual" },
    { value: "other", label: "Other" },
  ];

  const RELATIONSHIP_GOAL_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "casual", label: "Casual" },
    { value: "long_term", label: "Long-term" },
    { value: "friends", label: "Friends" },
    { value: "undecided", label: "Undecided" },
  ];

  const toggleInterestedIn = (g: GenderIdentity) => {
    setInterestedIn((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink-1">
      <div className="relative w-full max-w-lg px-4 z-10">
        {/* Progress bar */}
        <div className="mb-8 mx-auto max-w-xs">
          <div className="h-1 rounded-full overflow-hidden bg-ink-2">
            <motion.div
              className="h-full rounded-full bg-ink-9"
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-ink-5">
            <span>DOB</span>
            <span>Identity</span>
            <span>Preferences</span>
            <span>Photos</span>
            <span>Review</span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: Date of Birth */}
          {step === 1 && (
            <motion.div key="dob" variants={stepVariants} initial="enter" animate="center" exit="exit">
              <div className="rounded-3xl p-6 lg:p-8 bg-[var(--surface)] shadow-e-2">
                <div className="text-center mb-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring" as const, damping: 15, stiffness: 200, delay: 0.1 }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-ink-1 text-3xl"
                  >
                    🎂
                  </motion.div>
                  <h1 className="text-2xl font-bold mb-2 text-ink-9">When were you born?</h1>
                  <p className="text-ink-5 text-sm">You must be {MIN_AGE}+ to use dating features</p>
                </div>

                <div className="space-y-4">
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => { setDob(e.target.value); setError(""); }}
                    max={maxDobDate}
                    className="w-full h-14 px-4 text-lg rounded-xl text-ink-9 border border-[var(--ink-3)] bg-[var(--surface)] outline-none focus:ring-2 focus:ring-[var(--primary-500)] transition-shadow duration-200"
                    autoFocus
                  />

                  <ShakeError message={error} />

                  <div className="flex gap-3">
                    {continueButton(handleStep1, !dob)}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: Identity */}
          {step === 2 && (
            <motion.div key="identity" variants={stepVariants} initial="enter" animate="center" exit="exit">
              <div className="rounded-3xl p-6 lg:p-8 bg-[var(--surface)] shadow-e-2">
                <div className="text-center mb-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring" as const, damping: 15, stiffness: 200, delay: 0.1 }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-ink-1 text-3xl"
                  >
                    ✨
                  </motion.div>
                  <h1 className="text-2xl font-bold mb-2 text-ink-9">Tell us about yourself</h1>
                  <p className="text-ink-5 text-sm">This helps us find better matches for you</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <p className="text-sm font-medium text-ink-7 mb-3">I am a...</p>
                    <div className="flex flex-wrap gap-2">
                      {GENDER_OPTIONS.map((opt) => (
                        <ToggleButton
                          key={opt.value}
                          label={opt.label}
                          selected={gender === opt.value}
                          onClick={() => { setGender(opt.value); setError(""); }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-ink-7 mb-3">My orientation is...</p>
                    <div className="flex flex-wrap gap-2">
                      {ORIENTATION_OPTIONS.map((opt) => (
                        <ToggleButton
                          key={opt.value}
                          label={opt.label}
                          selected={orientation === opt.value}
                          onClick={() => { setOrientation(opt.value); setError(""); }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-ink-7 mb-3">I&apos;m looking for...</p>
                    <div className="flex flex-wrap gap-2">
                      {RELATIONSHIP_GOAL_OPTIONS.map((opt) => (
                        <ToggleButton
                          key={opt.value}
                          label={opt.label}
                          selected={relationshipGoal === opt.value}
                          onClick={() => { setRelationshipGoal(opt.value); setError(""); }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-ink-7 mb-2">Height (optional)</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={heightCm}
                        onChange={(e) => setHeightCm(e.target.value)}
                        placeholder="cm"
                        min={120}
                        max={230}
                        className="w-28 h-11 px-3 text-sm rounded-xl text-ink-9 border border-[var(--ink-3)] bg-[var(--surface)] outline-none focus:ring-2 focus:ring-[var(--primary-500)] transition-shadow duration-200"
                      />
                      <span className="text-sm text-ink-5">centimeters</span>
                    </div>
                  </div>

                  <ShakeError message={error} />

                  <div className="flex gap-3">
                    {backButton}
                    {continueButton(handleStep2, !gender || !orientation || !relationshipGoal)}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Preferences */}
          {step === 3 && (
            <motion.div key="preferences" variants={stepVariants} initial="enter" animate="center" exit="exit">
              <div className="rounded-3xl p-6 lg:p-8 bg-[var(--surface)] shadow-e-2 max-h-[80vh] overflow-y-auto">
                <div className="text-center mb-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring" as const, damping: 15, stiffness: 200, delay: 0.1 }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-ink-1 text-3xl"
                  >
                    🎯
                  </motion.div>
                  <h1 className="text-2xl font-bold mb-2 text-ink-9">Your preferences</h1>
                  <p className="text-ink-5 text-sm">Who are you looking for?</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <p className="text-sm font-medium text-ink-7 mb-3">Interested in</p>
                    <div className="flex flex-wrap gap-2">
                      {GENDER_OPTIONS.map((opt) => (
                        <ToggleButton
                          key={opt.value}
                          label={opt.label}
                          selected={interestedIn.includes(opt.value as GenderIdentity)}
                          onClick={() => toggleInterestedIn(opt.value as GenderIdentity)}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-ink-7 mb-3">
                      Age range: {minAge} – {maxAge}
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-ink-5 w-6">Min</span>
                        <input
                          type="range"
                          min={MIN_AGE}
                          max={99}
                          value={minAge}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setMinAge(Math.min(val, maxAge - 1));
                          }}
                          className="flex-1"
                        />
                        <span className="text-xs text-ink-7 w-6 text-right">{minAge}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-ink-5 w-6">Max</span>
                        <input
                          type="range"
                          min={MIN_AGE}
                          max={99}
                          value={maxAge}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setMaxAge(Math.max(val, minAge + 1));
                          }}
                          className="flex-1"
                        />
                        <span className="text-xs text-ink-7 w-6 text-right">{maxAge}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-ink-7 mb-3">
                      Max distance: {maxDistance} km
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={200}
                        value={maxDistance}
                        onChange={(e) => setMaxDistance(parseInt(e.target.value, 10))}
                        className="flex-1"
                      />
                      <span className="text-xs text-ink-7 w-12 text-right">{maxDistance} km</span>
                    </div>
                    {maxDistance > FREE_DISTANCE_KM && (
                      <p className="text-xs text-ink-5 mt-1">
                        Free plan: up to {FREE_DISTANCE_KM} km. Premium unlocks further.
                      </p>
                    )}
                  </div>

                  <ShakeError message={error} />

                  <div className="flex gap-3">
                    {backButton}
                    {continueButton(handleStep3, interestedIn.length === 0)}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 4: Dealbreakers */}
          {step === 4 && (
            <motion.div key="dealbreakers" variants={stepVariants} initial="enter" animate="center" exit="exit">
              <div className="rounded-3xl p-6 lg:p-8 bg-[var(--surface)] shadow-e-2">
                <div className="text-center mb-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring" as const, damping: 15, stiffness: 200, delay: 0.1 }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-ink-1 text-3xl"
                  >
                    🚫
                  </motion.div>
                  <h1 className="text-2xl font-bold mb-2 text-ink-9">Dealbreakers</h1>
                  <p className="text-ink-5 text-sm">Filter out what you can&apos;t accept</p>
                </div>

                <div className="space-y-4">
                  {[
                    { label: "Smoking is a dealbreaker", value: dealbreakerSmoking, set: setDealbreakerSmoking },
                    { label: "Drinking is a dealbreaker", value: dealbreakerDrinking, set: setDealbreakerDrinking },
                    { label: "Having kids is a dealbreaker", value: dealbreakerKids, set: setDealbreakerKids },
                    { label: "Verified profiles only", value: verifiedOnly, set: setVerifiedOnly },
                    { label: "Women only", value: womenOnly, set: setWomenOnly },
                  ].map(({ label, value, set }) => (
                    <label key={label} className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm text-ink-9">{label}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={value}
                        onClick={() => set((v) => !v)}
                        className={cn(
                          "relative w-11 h-6 rounded-full transition-colors duration-200",
                          value ? "bg-ink-9" : "bg-ink-3"
                        )}
                      >
                        <motion.span
                          animate={{ x: value ? 20 : 2 }}
                          transition={{ type: "spring" as const, damping: 20, stiffness: 300 }}
                          className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                        />
                      </button>
                    </label>
                  ))}

                  <div>
                    <p className="text-sm font-medium text-ink-7 mb-2">Dealbreaker relationship goal (optional)</p>
                    <div className="flex flex-wrap gap-2">
                      {RELATIONSHIP_GOAL_OPTIONS.map((opt) => (
                        <ToggleButton
                          key={opt.value}
                          label={opt.label}
                          selected={dealbreakerGoal === opt.value}
                          onClick={() => setDealbreakerGoal((prev) => prev === opt.value ? "" : opt.value)}
                        />
                      ))}
                    </div>
                  </div>

                  <ShakeError message={error} />

                  <div className="flex gap-3">
                    {backButton}
                    {continueButton(handleStep4)}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 5: Photos */}
          {step === 5 && (
            <motion.div key="photos" variants={stepVariants} initial="enter" animate="center" exit="exit">
              <div className="rounded-3xl p-6 lg:p-8 bg-[var(--surface)] shadow-e-2">
                <div className="text-center mb-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring" as const, damping: 15, stiffness: 200, delay: 0.1 }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-ink-1"
                  >
                    <Camera className="w-8 h-8 text-[var(--primary-500)]" />
                  </motion.div>
                  <h1 className="text-2xl font-bold mb-2 text-ink-9">Add your photos</h1>
                  <p className="text-ink-5 text-sm">
                    You need at least {MIN_DATING_PHOTOS} approved photos to start dating
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Photo count display */}
                  <div className="flex items-center justify-center gap-4 py-6 rounded-2xl bg-ink-1">
                    <div className="text-center">
                      <motion.p
                        key={approvedCount}
                        initial={{ scale: 1.3 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring" as const, damping: 15 }}
                        className={cn(
                          "text-4xl font-bold",
                          approvedCount >= MIN_DATING_PHOTOS ? "text-emerald-500" : "text-ink-9"
                        )}
                      >
                        {approvedCount}
                      </motion.p>
                      <p className="text-xs text-ink-5 mt-1">Approved</p>
                    </div>
                    <div className="text-2xl text-ink-4">/</div>
                    <div className="text-center">
                      <p className="text-4xl font-bold text-ink-4">{MIN_DATING_PHOTOS}</p>
                      <p className="text-xs text-ink-5 mt-1">Required</p>
                    </div>
                  </div>

                  {/* Dot progress indicators */}
                  <div className="flex gap-2 justify-center">
                    {Array.from({ length: MIN_DATING_PHOTOS }).map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{
                          background: i < approvedCount ? "#22c55e" : "var(--ink-3)",
                          scale: i < approvedCount ? 1.2 : 1,
                        }}
                        transition={{ type: "spring" as const, damping: 20, stiffness: 300 }}
                        className="w-3 h-3 rounded-full"
                      />
                    ))}
                  </div>

                  {approvedCount < MIN_DATING_PHOTOS && (
                    <p className="text-sm text-center text-ink-5">
                      Photos are reviewed by moderators. Upload them on your{" "}
                      <a href="/profile" className="text-[var(--primary-500)] underline">
                        profile page
                      </a>{" "}
                      and refresh here when approved.
                    </p>
                  )}

                  {approvedCount >= MIN_DATING_PHOTOS && (
                    <div className="flex items-center gap-2 text-emerald-600 text-sm justify-center">
                      <Check className="h-4 w-4" />
                      You have enough approved photos
                    </div>
                  )}

                  <button
                    onClick={refreshPhotoCount}
                    disabled={refreshingPhotos}
                    className="w-full h-10 rounded-xl border border-[var(--ink-3)] text-sm text-ink-7 flex items-center justify-center gap-2 hover:bg-ink-1 transition-colors"
                  >
                    <RefreshCw className={cn("h-4 w-4", refreshingPhotos && "animate-spin")} />
                    Refresh
                  </button>

                  <ShakeError message={error} />

                  <div className="flex gap-3">
                    {backButton}
                    {continueButton(handleStep5, approvedCount < MIN_DATING_PHOTOS)}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 6: Review */}
          {step === 6 && (
            <motion.div key="review" variants={stepVariants} initial="enter" animate="center" exit="exit">
              <div className="rounded-3xl p-6 lg:p-8 bg-[var(--surface)] shadow-e-2 max-h-[80vh] overflow-y-auto">
                <div className="text-center mb-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring" as const, damping: 15, stiffness: 200, delay: 0.1 }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-ink-1 text-3xl"
                  >
                    🎉
                  </motion.div>
                  <h1 className="text-2xl font-bold mb-2 text-ink-9">Almost there!</h1>
                  <p className="text-ink-5 text-sm">Review your dating profile</p>
                </div>

                <div className="space-y-3 text-sm">
                  <ReviewRow label="Date of birth" value={dob} />
                  <ReviewRow label="Gender" value={gender} />
                  <ReviewRow label="Orientation" value={orientation} />
                  <ReviewRow label="Height" value={heightCm ? `${heightCm} cm` : "Not specified"} />
                  <ReviewRow
                    label="Interested in"
                    value={interestedIn.length > 0 ? interestedIn.join(", ") : "—"}
                  />
                  <ReviewRow label="Age range" value={`${minAge} – ${maxAge}`} />
                  <ReviewRow label="Max distance" value={`${maxDistance} km`} />
                  <ReviewRow label="Approved photos" value={String(approvedCount)} />
                </div>

                <ShakeError message={error} className="mt-4" />

                <div className="flex gap-3 mt-6">
                  {backButton}
                  {continueButton(handleStep6, false, "Finish")}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-[var(--ink-2)]">
      <span className="text-ink-5">{label}</span>
      <span className="text-ink-9 font-medium capitalize">{value || "—"}</span>
    </div>
  );
}
