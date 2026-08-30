"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { m, AnimatePresence, LazyMotion, domAnimation } from "framer-motion";
import { Loader2, AlertCircle, ArrowRight, ArrowLeft, Check, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  currentProfileResponseSchema,
  interestCatalogResponseSchema,
  onboardingCompleteResponseSchema,
  completeOnboardingFlow,
  onboardingLoadState,
  onboardingRecoveryPolicy,
  profileInterestCreateResponseSchema,
  profileInterestDeleteResponseSchema,
  profileInterestsResponseSchema,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

const motion = m;
import type { InterestTag } from "@/types/database";

const MIN_USERNAME_LENGTH = 3;
const MIN_INTERESTS = 5;
const TOTAL_STEPS = 3;

async function loadOnboardingInterests() {
  return fetchContract("/api/profile/interests", profileInterestsResponseSchema);
}

const stepVariants = {
  enter: { opacity: 0, scale: 0.97 },
  center: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: "easeOut" as const } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.2, ease: "easeIn" as const } },
};

const shakeVariants = {
  shake: { x: [-10, 8, -6, 4, 0], transition: { duration: 0.4 } },
};

const categoryEmojis: Record<string, string> = {
  "Food & Drink": "🍽️", Sports: "⚽", Music: "🎵", Arts: "🎨",
  Outdoors: "🏕️", Gaming: "🎮", Tech: "💻", Wellness: "🧘",
  Travel: "✈️", Social: "🎉",
};

function ShakeError({ message, className }: { message: string; className?: string }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div variants={shakeVariants} animate="shake" exit={{ opacity: 0, scaleY: 0 }} className={`origin-top ${className ?? ""}`}>
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm bg-[var(--danger-50,oklch(0.97_0.02_27))] text-[var(--danger-600,oklch(0.55_0.18_27))]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// This page coordinates the multi-step onboarding flow and persistence.
// react-doctor-disable-next-line no-giant-component
export default function OnboardingPage() {
  const router = useRouter();
  const splashStart = useRef(0);
  const [invite, setInvite] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);

  const [interestTags, setInterestTags] = useState<InterestTag[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());
  const [interestLoading, setInterestLoading] = useState<string | null>(null);
  const [interestError, setInterestError] = useState("");
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsLoadError, setTagsLoadError] = useState(false);
  const [interestsLoading, setInterestsLoading] = useState(true);
  const [interestsLoadError, setInterestsLoadError] = useState(false);
  const [completing, setCompleting] = useState(false);

  // The route's invite parameter is read once when the client becomes interactive.
  // react-doctor-disable-next-line no-fetch-in-effect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInvite(params.get("invite"));
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const data = await fetchContract("/api/interests", interestCatalogResponseSchema);
      setInterestTags(data.tags);
    } catch {
      setTagsLoadError(true);
    } finally {
      setTagsLoading(false);
    }
  }, []);

  // Initial onboarding data is loaded only after the authenticated client mounts.
  // react-doctor-disable-next-line no-fetch-in-effect
  useEffect(() => {
    queueMicrotask(() => void fetchTags());
  }, [fetchTags]);

  const fetchUserInterests = useCallback(async () => {
    try {
      const data = await loadOnboardingInterests();
      setSelectedInterests(new Set<string>(data.interests.map((interest) => interest.tag_id)));
    } catch {
      setInterestsLoadError(true);
    } finally {
      setInterestsLoading(false);
    }
  }, []);

  // Initial authenticated interest state is synchronized when onboarding mounts.
  // react-doctor-disable-next-line no-fetch-in-effect
  useEffect(() => {
    queueMicrotask(() => void fetchUserInterests());
  }, [fetchUserInterests]);

  useEffect(() => {
    if (step !== 3) return;
    const elapsed = Date.now() - splashStart.current;
    const remaining = Math.max(0, 1500 - elapsed);
    const t = setTimeout(() => router.replace(invite ? `/invite/${invite}` : "/"), remaining);
    return () => clearTimeout(t);
  }, [step, router, invite]);

  const handleUsernameSubmit = async () => {
    if (username.length < MIN_USERNAME_LENGTH) {
      setUsernameError(`Username must be at least ${MIN_USERNAME_LENGTH} characters`);
      return;
    }
    setUsernameLoading(true);
    setUsernameError("");
    try {
      await fetchContract("/api/profile/username", currentProfileResponseSchema, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      setUsernameSaved(true);
      setTimeout(() => setStep(2), 600);
    } catch (error) {
      setUsernameError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setUsernameLoading(false);
    }
  };

  const handleInterestToggle = useCallback(async (tagId: string) => {
    if (interestLoading) return;
    const isSelected = selectedInterests.has(tagId);
    if (!isSelected && selectedInterests.size >= MIN_INTERESTS) return;

    setInterestLoading(tagId);
    setInterestError("");
    try {
      if (isSelected) {
        await fetchContract(
          `/api/profile/interests/${tagId}`,
          profileInterestDeleteResponseSchema,
          { method: "DELETE" },
        );
        setSelectedInterests((prev) => {
          const next = new Set(prev);
          next.delete(tagId);
          return next;
        });
      } else {
        await fetchContract("/api/profile/interests", profileInterestCreateResponseSchema, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag_id: tagId }),
        });
        setSelectedInterests((prev) => new Set(prev).add(tagId));
      }
    } catch (error) {
      setInterestError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setInterestLoading(null);
    }
  }, [interestLoading, selectedInterests]);

  const handleComplete = async () => {
    if (selectedInterests.size < MIN_INTERESTS) {
      setInterestError(`Please select at least ${MIN_INTERESTS} interests`);
      return;
    }
    setCompleting(true);
    setInterestError("");
    try {
      await completeOnboardingFlow({
        request: () => fetchContract(
          "/api/profile/complete-onboarding",
          onboardingCompleteResponseSchema,
          { method: "POST" },
        ),
        commit: () => {
          splashStart.current = Date.now();
          setStep(3);
        },
      });
    } catch (error) {
      setInterestError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      setCompleting(false);
    }
  };

  const groupedTags = useMemo(() =>
    interestTags.reduce((acc, tag) => {
      if (!acc[tag.category]) acc[tag.category] = [];
      acc[tag.category].push(tag);
      return acc;
    }, {} as Record<string, InterestTag[]>),
  [interestTags]);

  const progressPercent = ((step - 1) / (TOTAL_STEPS - 1)) * 100;
  const canSubmitUsername = username.length >= MIN_USERNAME_LENGTH && !usernameLoading;
  const canFinish = selectedInterests.size >= MIN_INTERESTS && !completing;
  const initialLoadState = onboardingLoadState({
    pending: interestsLoading,
    failed: interestsLoadError,
    scope: "initial",
    reload: [async () => {
      setInterestsLoading(true);
      setInterestsLoadError(false);
      await fetchUserInterests();
    }],
  });

  if (initialLoadState.kind !== "ready") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1 px-4">
        {initialLoadState.kind === "loading" ? (
          <Loader2 className="h-8 w-8 animate-spin text-[var(--primary-500)]" />
        ) : (
          <div className="w-full max-w-sm space-y-4 text-center">
            <ShakeError message={initialLoadState.message} />
            <button
              type="button"
              onClick={() => void initialLoadState.action.run()}
              className="h-12 w-full rounded-full bg-ink-9 font-semibold text-white shadow-e-1"
            >
              {initialLoadState.action.label}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink-1">

      <div className="relative w-full max-w-lg px-4 z-10">
        {/* Progress bar */}
        {step < 3 && (
          <div className="mb-8 mx-auto max-w-xs">
            <div className="h-1 rounded-full overflow-hidden bg-ink-2">
              <motion.div
                className="h-full origin-left rounded-full bg-ink-9"
                animate={{ scaleX: progressPercent / 100 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-ink-5">
              <span>Username</span>
              <span>Interests</span>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Step 1: Username */}
          {step === 1 && (
            <motion.div key="username" variants={stepVariants} initial="enter" animate="center" exit="exit">
              <div className="rounded-3xl p-6 lg:p-8 bg-[var(--surface)] shadow-e-2">
                <div className="text-center mb-8">
                  <motion.div
                    initial={{ scale: 0.95 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring" as const, damping: 15, stiffness: 200, delay: 0.1 }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-ink-1"
                  >
                    <AtSign className="w-8 h-8 text-[var(--primary-500)]" />
                  </motion.div>
                  <h1 className="text-2xl lg:text-3xl font-bold mb-2 text-ink-9">
                    Welcome to Peek &amp; Poke!
                  </h1>
                  <p className="text-ink-5">Choose a username to get started</p>
                </div>

                <div className="space-y-4">
                  <div className="relative">
                    <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-5" />
                    <input
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                        setUsernameError("");
                        setUsernameSaved(false);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter" && canSubmitUsername) handleUsernameSubmit(); }}
                      placeholder="username"
                      maxLength={20}
                      className="w-full h-14 pl-11 pr-12 text-lg rounded-xl text-ink-9 placeholder:text-ink-4 border border-[var(--ink-3)] bg-[var(--surface)] outline-none focus:ring-2 focus:ring-[var(--primary-500)] transition-shadow duration-200"
                      autoFocus
                    />
                    <AnimatePresence>
                      {usernameSaved && (
                        <motion.div
                          initial={{ scale: 0.95, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.95, opacity: 0 }}
                          transition={{ type: "spring" as const, damping: 15 }}
                          className="absolute right-4 top-1/2 -translate-y-1/2"
                        >
                          <Check className="h-5 w-5 text-emerald-400" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Character counter */}
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-ink-5">
                      Letters, numbers, underscores
                    </span>
                    <span className={cn("text-xs", username.length >= MIN_USERNAME_LENGTH ? "text-[var(--primary-500)]" : "text-ink-5")}>
                      {username.length}/20
                    </span>
                  </div>

                  <ShakeError message={usernameError} />

                  <motion.button
                    whileHover={canSubmitUsername ? { scale: 1.02 } : {}}
                    whileTap={canSubmitUsername ? { scale: 0.97 } : {}}
                    onClick={handleUsernameSubmit}
                    disabled={!canSubmitUsername}
                    className={cn(
                      "w-full h-12 rounded-full font-semibold text-base flex items-center justify-center gap-2 transition-all duration-300",
                      canSubmitUsername
                        ? "bg-ink-9 text-white shadow-e-1 cursor-pointer"
                        : "bg-ink-2 text-ink-4 cursor-not-allowed"
                    )}
                  >
                    {usernameLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: Interests — full-page scroll */}
          {step === 2 && (
            <motion.div
              key="interests"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="fixed inset-0 overflow-y-auto bg-ink-1"
            >
              {/* Sticky header */}
              <div className="sticky top-0 z-20 pt-6 pb-4 px-4 bg-ink-1">
                <div className="max-w-lg mx-auto text-center">
                  <h1 className="text-2xl font-bold text-ink-9 mb-1">Pick your interests</h1>
                  <p className="text-sm text-ink-5">
                    Select at least {MIN_INTERESTS} things you love
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <motion.span
                      key={selectedInterests.size}
                      initial={{ scale: 1.4, color: "var(--primary-500)" }}
                      animate={{ scale: 1, color: "var(--ink-9)" }}
                      className="font-semibold text-sm"
                    >
                      {selectedInterests.size}
                    </motion.span>
                    <span className="text-sm text-ink-5">/</span>
                    <span className="text-sm text-ink-5">{MIN_INTERESTS}</span>
                    <div className="flex gap-1 ml-1">
                      {[...Array(MIN_INTERESTS)].map((_, i) => (
                        <motion.div
                          key={i}
                          animate={{
                            background: i < selectedInterests.size ? "var(--primary-500)" : "var(--ink-3)",
                            scale: i < selectedInterests.size ? 1.2 : 1,
                          }}
                          transition={{ type: "spring" as const, damping: 20, stiffness: 300 }}
                          className="w-2 h-2 rounded-full"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="max-w-lg mx-auto px-4 pb-28 space-y-6">
                {tagsLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--primary-500)]" />
                  </div>
                ) : tagsLoadError ? (
                  <div className="space-y-4 py-12 text-center">
                    <ShakeError message={onboardingRecoveryPolicy.interests.message} />
                    <button
                      type="button"
                      onClick={() => {
                        setTagsLoading(true);
                        setTagsLoadError(false);
                        void fetchTags();
                      }}
                      className="h-12 w-full rounded-full bg-ink-9 font-semibold text-white shadow-e-1"
                    >
                      {onboardingRecoveryPolicy.interests.action}
                    </button>
                  </div>
                ) : (
                  Object.entries(groupedTags).map(([category, tags], catIdx) => (
                    <motion.div
                      key={category}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: catIdx * 0.06, duration: 0.3 }}
                    >
                      <h3 className="font-medium mb-3 flex items-center gap-2 text-sm text-ink-5">
                        <span>{categoryEmojis[category] || "📌"}</span>
                        {category}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => {
                          const isSelected = selectedInterests.has(tag.id);
                          const isLoading = interestLoading === tag.id;
                          const isDisabled = !isSelected && selectedInterests.size >= MIN_INTERESTS;
                          return (
                            <motion.button
                              key={tag.id}
                              whileTap={!isDisabled ? { scale: 0.92 } : {}}
                              animate={isSelected ? { scale: 1.05 } : { scale: 1 }}
                              transition={{ type: "spring" as const, damping: 20, stiffness: 300 }}
                              onClick={() => !isDisabled && handleInterestToggle(tag.id)}
                              disabled={isDisabled}
                              className={cn(
                                "px-4 py-2 text-sm rounded-full border-0 transition-all duration-200 flex items-center gap-1",
                                isSelected
                                  ? "bg-ink-9 text-white shadow-e-1"
                                  : "bg-[var(--surface)] shadow-e-1 text-ink-9",
                                isDisabled && !isSelected && "opacity-40 cursor-not-allowed",
                                isLoading && "opacity-50"
                              )}
                            >
                              {isLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : tag.icon ? (
                                <span>{tag.icon}</span>
                              ) : null}
                              {tag.name}
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Sticky bottom bar */}
              <div className="fixed bottom-0 left-0 right-0 z-20 px-4 pb-6 pt-4 bg-ink-1">
                <div className="max-w-lg mx-auto">
                  <ShakeError message={interestError} className="mb-3" />
                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setStep(1)}
                      className="flex-1 h-12 rounded-full font-medium flex items-center justify-center gap-2 bg-[var(--surface)] shadow-e-2 text-ink-6"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </motion.button>
                    <motion.button
                      whileHover={canFinish ? { scale: 1.02 } : {}}
                      whileTap={canFinish ? { scale: 0.97 } : {}}
                      onClick={handleComplete}
                      disabled={!canFinish}
                      className={cn(
                        "flex-1 h-12 rounded-full font-semibold flex items-center justify-center gap-2 transition-all duration-300",
                        canFinish
                          ? "bg-ink-9 text-white shadow-e-1 cursor-pointer"
                          : "bg-ink-2 text-ink-4 cursor-not-allowed"
                      )}
                    >
                      {completing ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        "Finish"
                      )}
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Welcome splash */}
          {step === 3 && (
            <motion.div
              key="splash"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring" as const, damping: 12, stiffness: 150, delay: 0.2 }}
                className="mb-6"
              >
                <Image src="/images/logo.png" alt="" width={80} height={80} className="mx-auto" />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
                className="text-3xl font-bold text-ink-9 mb-3"
              >
                You&apos;re all set, @{username}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7, duration: 0.4 }}
                className="text-ink-5"
              >
                Taking you to the map...
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="mt-8 flex justify-center"
              >
                <Loader2 className="h-6 w-6 animate-spin text-[var(--primary-500)]" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>
    </LazyMotion>
  );
}
