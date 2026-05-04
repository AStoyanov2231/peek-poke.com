"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { isPremium, isPlatinum } from "@/types/database";
import { FREE_DISTANCE_KM, MIN_AGE } from "@/lib/constants";
import type { GenderIdentity, RelationshipGoal, DatingPreferences } from "@/types/database";

interface DatingPrefsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DraftPrefs = Omit<DatingPreferences, "user_id" | "updated_at">;

const DEFAULT_DRAFT: DraftPrefs = {
  interested_in: [],
  min_age: MIN_AGE,
  max_age: 45,
  max_distance_km: FREE_DISTANCE_KM,
  dealbreaker_smoking: false,
  dealbreaker_drinking: false,
  dealbreaker_kids: false,
  dealbreaker_relationship_goal: null,
  verified_only: false,
  women_only: false,
};

const GENDER_OPTIONS: { value: GenderIdentity; label: string }[] = [
  { value: "man", label: "Men" },
  { value: "woman", label: "Women" },
  { value: "non_binary", label: "Non-binary" },
  { value: "other", label: "Other" },
];

const GOAL_OPTIONS: { value: RelationshipGoal | null; label: string }[] = [
  { value: null, label: "Any" },
  { value: "casual", label: "Casual" },
  { value: "long_term", label: "Long-term" },
  { value: "friends", label: "Friends" },
  { value: "undecided", label: "Undecided" },
];

export function DatingPrefsSheet({ open, onOpenChange }: DatingPrefsSheetProps) {
  const profile = useAppStore((s) => s.profile);
  const datingPreferences = useAppStore((s) => s.datingPreferences);
  const isDatingPrefsLoaded = useAppStore((s) => s.isDatingPrefsLoaded);
  const fetchDatingPreferences = useAppStore((s) => s.fetchDatingPreferences);
  const updateDatingPreferences = useAppStore((s) => s.updateDatingPreferences);

  const [draft, setDraft] = useState<DraftPrefs>(DEFAULT_DRAFT);

  const isPaidUser = isPremium(profile) || isPlatinum(profile);
  const maxDistance = isPaidUser ? 100 : FREE_DISTANCE_KM;

  useEffect(() => {
    if (open && !isDatingPrefsLoaded) {
      fetchDatingPreferences();
    }
  }, [open, isDatingPrefsLoaded, fetchDatingPreferences]);

  useEffect(() => {
    if (datingPreferences) {
      const { user_id: _u, updated_at: _t, ...rest } = datingPreferences;
      setDraft(rest);
    }
  }, [datingPreferences]);

  const handleClose = () => onOpenChange(false);

  const handleSave = async () => {
    // Clamp distance to user's allowed max in case prefs were set when on a higher plan
    const payload: DraftPrefs = {
      ...draft,
      max_distance_km: Math.min(draft.max_distance_km, maxDistance),
    };
    await updateDatingPreferences(payload);
    onOpenChange(false);
  };

  const toggleGender = (value: GenderIdentity) => {
    setDraft((prev) => {
      const has = prev.interested_in.includes(value);
      return {
        ...prev,
        interested_in: has
          ? prev.interested_in.filter((g) => g !== value)
          : [...prev.interested_in, value],
      };
    });
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
          <h2 className="font-display text-[22px] font-bold text-foreground">Dating Preferences</h2>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-background shadow-e-1 flex items-center justify-center"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 pb-8 flex flex-col gap-6">
          {/* Interested In */}
          <Section label="Interested In">
            <div className="flex flex-wrap gap-2">
              {GENDER_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleGender(value)}
                  className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-colors ${
                    draft.interested_in.includes(value)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>

          {/* Age Range */}
          <Section label="Age Range">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[13px] text-muted-foreground">
                  <span>Min age</span>
                  <span>{draft.min_age}</span>
                </div>
                <input
                  type="range"
                  min={MIN_AGE}
                  max={99}
                  value={draft.min_age}
                  aria-label="min age"
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDraft((prev) => ({
                      ...prev,
                      min_age: val,
                      max_age: Math.max(prev.max_age, val),
                    }));
                  }}
                  className="w-full accent-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[13px] text-muted-foreground">
                  <span>Max age</span>
                  <span>{draft.max_age}</span>
                </div>
                <input
                  type="range"
                  min={MIN_AGE}
                  max={99}
                  value={draft.max_age}
                  aria-label="max age"
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDraft((prev) => ({
                      ...prev,
                      max_age: val,
                      min_age: Math.min(prev.min_age, val),
                    }));
                  }}
                  className="w-full accent-primary"
                />
              </div>
            </div>
          </Section>

          {/* Max Distance */}
          <Section label="Max Distance">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[13px] text-muted-foreground">
                <span>Distance</span>
                <span>{draft.max_distance_km} km</span>
              </div>
              <input
                type="range"
                min={1}
                max={maxDistance}
                value={Math.min(draft.max_distance_km, maxDistance)}
                aria-label="distance"
                onChange={(e) => {
                  setDraft((prev) => ({ ...prev, max_distance_km: Number(e.target.value) }));
                }}
                className="w-full accent-primary"
              />
              {!isPaidUser && (
                <p className="text-[12px] text-muted-foreground mt-1">
                  (Premium required for {FREE_DISTANCE_KM}+ km)
                </p>
              )}
            </div>
          </Section>

          {/* Dealbreakers */}
          <Section label="Dealbreakers">
            <div className="flex flex-col gap-3">
              <ToggleRow
                label="Smoking"
                checked={draft.dealbreaker_smoking}
                onChange={(v) => setDraft((prev) => ({ ...prev, dealbreaker_smoking: v }))}
              />
              <ToggleRow
                label="Drinking"
                checked={draft.dealbreaker_drinking}
                onChange={(v) => setDraft((prev) => ({ ...prev, dealbreaker_drinking: v }))}
              />
              <ToggleRow
                label="Has kids"
                checked={draft.dealbreaker_kids}
                onChange={(v) => setDraft((prev) => ({ ...prev, dealbreaker_kids: v }))}
              />
            </div>
          </Section>

          {/* Relationship Goal Dealbreaker */}
          <Section label="Relationship Goal Dealbreaker">
            <div className="flex flex-wrap gap-2">
              {GOAL_OPTIONS.map(({ value, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, dealbreaker_relationship_goal: value }))
                  }
                  className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-colors ${
                    draft.dealbreaker_relationship_goal === value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>

          {/* Verified Only */}
          <Section label="Verified Only">
            <ToggleRow
              label="Verified profiles only"
              checked={draft.verified_only}
              disabled={!isPaidUser}
              onChange={(v) => setDraft((prev) => ({ ...prev, verified_only: v }))}
              hint={!isPaidUser ? "(Premium)" : undefined}
            />
          </Section>

          {/* Women Only */}
          <Section label="Women Only">
            <ToggleRow
              label="Women only"
              checked={draft.women_only}
              onChange={(v) => setDraft((prev) => ({ ...prev, women_only: v }))}
              hint="Only pokes from women will count."
            />
          </Section>

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            className="w-full h-12 rounded-sm bg-primary text-primary-foreground text-[15px] font-semibold"
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
        {label}
      </span>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between h-[52px] px-4 bg-background shadow-e-2 rounded-sm">
      <div className="flex flex-col">
        <span className="text-[15px] font-medium text-foreground">{label}</span>
        {hint && <span className="text-[12px] text-muted-foreground">{hint}</span>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-primary"
      />
    </div>
  );
}
