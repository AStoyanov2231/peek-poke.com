"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, AlertCircle, ArrowRight, ArrowLeft, Check, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InterestTag } from "@/types/database";

const MIN_USERNAME_LENGTH = 3;
const MIN_INTERESTS = 5;
const TOTAL_STEPS = 3;

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
        <motion.div variants={shakeVariants} animate="shake" exit={{ opacity: 0, height: 0 }} className={className}>
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm bg-red-50 text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInvite(params.get("invite"));
  }, []);

  useEffect(() => {
    async function fetchTags() {
      try {
        const res = await fetch("/api/interests");
        const data = await res.json();
        if (data.tags) setInterestTags(data.tags);
      } catch {
        /* noop */
      } finally {
        setTagsLoading(false);
      }
    }
    fetchTags();
  }, []);

  useEffect(() => {
    async function fetchUserInterests() {
      try {
        const res = await fetch("/api/profile/interests");
        const data = await res.json();
        if (data.interests) {
          setSelectedInterests(new Set<string>(data.interests.map((i: { tag_id: string }) => i.tag_id)));
        }
      } catch {
        /* noop */
      }
    }
    fetchUserInterests();
  }, []);

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
      const res = await fetch("/api/profile/username", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUsernameError(data.error || "Failed to update username");
        setUsernameLoading(false);
        return;
      }
      setUsernameSaved(true);
      setTimeout(() => setStep(2), 600);
    } catch {
      setUsernameError("Something went wrong. Please try again.");
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
        const res = await fetch(`/api/profile/interests/${tagId}`, { method: "DELETE" });
        if (res.ok) {
          setSelectedInterests((prev) => {
            const next = new Set(prev);
            next.delete(tagId);
            return next;
          });
        } else {
          setInterestError("Failed to remove interest");
        }
      } else {
        const res = await fetch("/api/profile/interests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag_id: tagId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setInterestError(data.error || "Failed to add interest");
        } else {
          setSelectedInterests((prev) => new Set(prev).add(tagId));
        }
      }
    } catch {
      setInterestError("Something went wrong. Please try again.");
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
      const res = await fetch("/api/profile/complete-onboarding", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setInterestError(data.error || "Failed to complete onboarding");
        setCompleting(false);
        return;
      }
      splashStart.current = Date.now();
      setStep(3);
    } catch {
      setInterestError("Something went wrong. Please try again.");
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-background">

      <div className="relative w-full max-w-lg px-4 z-10">
        {/* Progress bar */}
        {step < 3 && (
          <div className="mb-8 mx-auto max-w-xs">
            <div className="h-1 rounded-full overflow-hidden bg-neu-sunken shadow-neu-inset">
              <motion.div
                className="h-full rounded-full bg-primary-gradient"
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>Username</span>
              <span>Interests</span>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Step 1: Username */}
          {step === 1 && (
            <motion.div key="username" variants={stepVariants} initial="enter" animate="center" exit="exit">
              <div className="rounded-3xl p-6 lg:p-8 bg-background shadow-neu-raised">
                <div className="text-center mb-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring" as const, damping: 15, stiffness: 200, delay: 0.1 }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-background shadow-neu-inset"
                  >
                    <AtSign className="w-8 h-8 text-primary" />
                  </motion.div>
                  <h1 className="text-2xl lg:text-3xl font-bold mb-2">
                    <span className="text-brand-gradient">Welcome to Peek &amp; Poke!</span>
                  </h1>
                  <p className="text-muted-foreground">Choose a username to get started</p>
                </div>

                <div className="space-y-4">
                  <div className="relative">
                    <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
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
                      className="w-full h-14 pl-11 pr-12 text-lg rounded-xl text-foreground placeholder:text-muted-foreground border-none outline-none transition-shadow duration-300 bg-background shadow-neu-inset"
                      style={{
                        boxShadow: username.length > 0 ? "inset 4px 4px 8px #94B1AF, inset -4px -4px 8px #E5F4F3, 0 0 0 2px hsl(var(--primary) / 0.4)" : undefined,
                      }}
                      autoFocus
                    />
                    <AnimatePresence>
                      {usernameSaved && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
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
                    <span className="text-xs text-muted-foreground">
                      Letters, numbers, underscores
                    </span>
                    <span className={cn("text-xs", username.length >= MIN_USERNAME_LENGTH ? "text-primary" : "text-muted-foreground")}>
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
                        ? "bg-primary-gradient text-white shadow-neu-raised-sm cursor-pointer"
                        : "bg-neu-sunken text-muted-foreground shadow-neu-inset cursor-not-allowed"
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
              className="fixed inset-0 overflow-y-auto bg-background"
            >
              {/* Sticky header */}
              <div className="sticky top-0 z-20 pt-6 pb-4 px-4 bg-background">
                <div className="max-w-lg mx-auto text-center">
                  <h1 className="text-2xl font-bold text-foreground mb-1">Pick your interests</h1>
                  <p className="text-sm text-muted-foreground">
                    Select at least {MIN_INTERESTS} things you love
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <motion.span
                      key={selectedInterests.size}
                      initial={{ scale: 1.4, color: "hsl(var(--primary))" }}
                      animate={{ scale: 1, color: "hsl(var(--foreground))" }}
                      className="font-semibold text-sm"
                    >
                      {selectedInterests.size}
                    </motion.span>
                    <span className="text-sm text-muted-foreground">/</span>
                    <span className="text-sm text-muted-foreground">{MIN_INTERESTS}</span>
                    <div className="flex gap-1 ml-1">
                      {[...Array(MIN_INTERESTS)].map((_, i) => (
                        <motion.div
                          key={i}
                          animate={{
                            background: i < selectedInterests.size ? "hsl(var(--primary))" : "hsl(var(--border))",
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
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  Object.entries(groupedTags).map(([category, tags], catIdx) => (
                    <motion.div
                      key={category}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: catIdx * 0.06, duration: 0.3 }}
                    >
                      <h3 className="font-medium mb-3 flex items-center gap-2 text-sm text-muted-foreground">
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
                                  ? "bg-primary-gradient text-white shadow-neu-raised-sm"
                                  : "bg-background shadow-neu-raised-sm text-foreground",
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
              <div className="fixed bottom-0 left-0 right-0 z-20 px-4 pb-6 pt-4 bg-background">
                <div className="max-w-lg mx-auto">
                  <ShakeError message={interestError} className="mb-3" />
                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setStep(1)}
                      className="flex-1 h-12 rounded-full font-medium flex items-center justify-center gap-2 bg-background shadow-neu-raised text-muted-foreground"
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
                          ? "bg-primary-gradient text-white shadow-neu-raised-sm cursor-pointer"
                          : "bg-neu-sunken text-muted-foreground shadow-neu-inset cursor-not-allowed"
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
                initial={{ scale: 0 }}
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
                className="text-3xl font-bold text-foreground mb-3"
              >
                You&apos;re all set, @{username}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7, duration: 0.4 }}
                className="text-muted-foreground"
              >
                Taking you to the map...
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="mt-8 flex justify-center"
              >
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
