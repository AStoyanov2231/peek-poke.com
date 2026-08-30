"use client";

import { useState, useRef, useLayoutEffect, useEffect, forwardRef, useImperativeHandle } from "react";
import { X, Loader2, Pencil, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { InterestPicker } from "@/features/profile/components/InterestPicker";
import type { ProfileInterest, InterestTag } from "@/types/database";

export interface ProfileInterestsRef {
  save: () => Promise<void>;
}

interface ProfileInterestsProps {
  interests: ProfileInterest[];
  allTags?: InterestTag[];
  owner?: {
    editing?: boolean;
    onDone?: () => void;
    hideEditButton?: boolean;
  };
  onAddInterest?: (tagId: string) => Promise<void>;
  onRemoveInterest?: (interestId: string) => Promise<void>;
  className?: string;
  hideTitle?: boolean;
}

const COLORS = [
  { bg: "#EDE9FF", text: "#6C63FF" },
  { bg: "#E6F9F0", text: "#38A169" },
  { bg: "#FEF3E2", text: "#C05621" },
  { bg: "#FEE8E8", text: "#C53030" },
  { bg: "#E8F4FD", text: "#2B6CB0" },
  { bg: "#E6FFFA", text: "#2C7A7B" },
];


// This component owns the editable interest picker and its FLIP animation lifecycle.
// react-doctor-disable-next-line no-giant-component
export const ProfileInterests = forwardRef<ProfileInterestsRef, ProfileInterestsProps>(function ProfileInterests({
  interests,
  allTags = [],
  owner,
  onAddInterest,
  onRemoveInterest,
  className,
  hideTitle = false,
}: ProfileInterestsProps, ref: React.Ref<ProfileInterestsRef>) {
  const isOwner = owner !== undefined;
  const isEditing = owner?.editing;
  const onDone = owner?.onDone;
  const hideEditButton = owner?.hideEditButton ?? false;
  const isControlled = isEditing !== undefined;
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isControlled ? isEditing : internalExpanded;
  const setIsExpanded = (v: boolean) => { if (!isControlled) setInternalExpanded(v); };
  // Local state — only synced to DB when Done is pressed
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(
    () => new Set(interests.map((i) => i.tag_id))
  );

  // When controlled edit mode opens, reset local state to server state
  useEffect(() => {
    if (isControlled && isEditing) {
      setLocalSelectedIds(new Set(interests.map((i) => i.tag_id)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const tagRefs = useRef<Map<string, HTMLElement>>(new Map());
  const pendingFlips = useRef<Map<string, DOMRect>>(new Map());
  const enteringId = useRef<string | null>(null);
  const animatingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerScrollRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  const updatePickerScrollHint = () => {
    const el = pickerScrollRef.current;
    if (!el) return;
    setShowScrollHint(el.scrollHeight > el.clientHeight + 8 && el.scrollTop + el.clientHeight < el.scrollHeight - 8);
  };

  const checkPickerScroll = () => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      updatePickerScrollHint();
    });
  };

  useEffect(() => {
    if (isExpanded) {
      const t = setTimeout(checkPickerScroll, 320);
      return () => {
        clearTimeout(t);
        if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
      };
    } else {
      setShowScrollHint(false);
    }
  }, [isExpanded]);

  // FLIP all tags that moved; scale-in the newly entered tag
  useLayoutEffect(() => {
    pendingFlips.current.forEach((firstRect, tagId) => {
      const el = tagRefs.current.get(tagId);
      if (!el) return;
      const lastRect = el.getBoundingClientRect();
      const dx = firstRect.left - lastRect.left;
      const dy = firstRect.top - lastRect.top;
      if (dx === 0 && dy === 0) return;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.getBoundingClientRect();
      requestAnimationFrame(() => {
        el.style.transition = "transform 350ms cubic-bezier(0.4, 0, 0.2, 1)";
        el.style.transform = "";
      });
    });

    // Scale-in for the newly added tag (not in pendingFlips = wasn't in DOM before)
    if (enteringId.current) {
      const id = enteringId.current;
      if (!pendingFlips.current.has(id)) {
        const el = tagRefs.current.get(id);
        if (el) {
          el.style.transition = "none";
          el.style.transform = "scale(0.4)";
          el.style.opacity = "0";
          el.getBoundingClientRect();
          requestAnimationFrame(() => {
            el.style.transition = "transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 250ms ease";
            el.style.transform = "";
            el.style.opacity = "";
          });
        }
      }
      enteringId.current = null;
    }

    pendingFlips.current.clear();
  });

  const captureAll = () => {
    tagRefs.current.forEach((el, tagId) => {
      pendingFlips.current.set(tagId, el.getBoundingClientRect());
    });
  };

  const scheduleAnimatingClear = () => {
    if (animatingTimeout.current) clearTimeout(animatingTimeout.current);
    animatingTimeout.current = setTimeout(() => setAnimatingId(null), 400);
  };

  // Purely local — no DB call, animation only
  const handleAdd = (tag: InterestTag) => {
    if (animatingId || localSelectedIds.size >= 5) return;
    captureAll();
    enteringId.current = tag.id;
    setAnimatingId(tag.id);
    setLocalSelectedIds((prev) => new Set([...prev, tag.id]));
    scheduleAnimatingClear();
  };

  // Purely local — no DB call, animation only
  const handleRemove = (tagId: string) => {
    if (animatingId) return;
    captureAll();
    setAnimatingId(tagId);
    setLocalSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(tagId);
      return next;
    });
    scheduleAnimatingClear();
  };

  // Commit diff to DB on Done
  const handleDone = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const serverIds = new Set(interests.map((i) => i.tag_id));
      const toAdd = [...localSelectedIds].filter((id) => !serverIds.has(id));
      const toRemove = interests.filter((i) => !localSelectedIds.has(i.tag_id));

      await Promise.all([
        ...toAdd.map((id) => onAddInterest?.(id)),
        ...toRemove.map((i) => onRemoveInterest?.(i.id)),
      ]);

      if (isControlled) onDone?.();
      else setIsExpanded(false);
    } catch {
      setLocalSelectedIds(new Set(interests.map((i) => i.tag_id)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpen = () => {
    // Always reset to server state when opening edit mode
    setLocalSelectedIds(new Set(interests.map((i) => i.tag_id)));
    setIsExpanded(true);
  };

  useImperativeHandle(ref, () => ({ save: handleDone }));

  const makeTagRef = (tagId: string) => (el: HTMLElement | null) => {
    if (el) tagRefs.current.set(tagId, el);
    else tagRefs.current.delete(tagId);
  };

  // Stable color per tag based on position in allTags
  // When allTags is empty (non-owner view), fall back to embedded tag objects from interests
  const effectiveTags = allTags.length > 0
    ? allTags
    : interests.map((i) => i.tag).filter((t): t is InterestTag => t !== undefined);
  const tagColorIndex = new Map(effectiveTags.map((t, i) => [t.id, i % COLORS.length]));
  const tagById = new Map(effectiveTags.map((t) => [t.id, t]));

  const selectedTags = [...localSelectedIds]
    .map((id) => tagById.get(id))
    .filter((t): t is InterestTag => t !== undefined);

  // Available tags grouped by category, excluding selected
  const tagsByCategory = allTags.reduce((acc, tag) => {
    if (localSelectedIds.has(tag.id)) return acc;
    if (!acc[tag.category]) acc[tag.category] = [];
    acc[tag.category].push(tag);
    return acc;
  }, {} as Record<string, InterestTag[]>);

  const canAddMore = localSelectedIds.size < 5;

  if (interests.length === 0 && !isOwner) {
    return null;
  }

  return (
    <div className={cn("px-4 md:px-6 py-4", className)}>
      {(!hideTitle || (isOwner && isExpanded)) && (
        <div className="flex items-center justify-between mb-3">
          {!hideTitle
            ? <h3 className="text-[16px] font-semibold text-foreground">Interests</h3>
            : <div />
          }
          {isOwner && (isExpanded ? (
            <button type="button"
              onClick={handleDone}
              disabled={isSaving}
              className="bg-ink-9 rounded-sm px-3 py-1.5 text-xs font-medium text-white flex items-center gap-1.5 disabled:opacity-50 shadow-e-1"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Done
            </button>
          ) : !hideEditButton ? (
            <button type="button"
              onClick={handleOpen}
              aria-label="Edit interests"
              className="iconbtn"
              style={{ width: 36, height: 36, borderRadius: "50%" }}
            >
              <Pencil className="h-[15px] w-[15px]" strokeWidth={2} />
            </button>
          ) : null)}
        </div>
      )}

      {/* Selected tags */}
      <div className="flex flex-wrap gap-2 min-h-[28px] p-1">
        {selectedTags.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Add interests to help others connect with you
          </p>
        ) : (
          selectedTags.map((tag) => {
            const color = COLORS[tagColorIndex.get(tag.id) ?? 0];
            const isAnimating = animatingId === tag.id;
            return (
              <span
                key={tag.id}
                ref={makeTagRef(tag.id)}
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium shadow-e-1",
                  isAnimating && "pointer-events-none"
                )}
                style={{
                  backgroundColor: color.bg,
                  color: color.text,
                  border: `1px solid ${color.text}30`,
                }}
              >
                {tag.name}
                {isExpanded && (
                  <button type="button"
                    onClick={() => handleRemove(tag.id)}
                    aria-label={`Remove ${tag.name}`}
                    disabled={!!animatingId}
                    className="ml-2"
                    style={{ color: color.text }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })
        )}
      </div>

      {/* Accordion: available tags */}
      {isOwner && (
        <div
          style={{
            display: "grid",
            gridTemplateRows: isExpanded ? "1fr" : "0fr",
            transition: "grid-template-rows 300ms ease",
            overflow: "hidden",
          }}
        >
          <div style={{ minHeight: 0 }} className="relative pt-1">
            <div
              ref={pickerScrollRef}
              onScroll={checkPickerScroll}
              className="overflow-y-auto max-h-[240px] pt-3 px-1 pb-1 scrollbar-hide"
              style={{
                maskImage: "linear-gradient(to bottom, transparent 0%, black 18%)",
                WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 18%)",
              }}
            >
              <InterestPicker
                tagsByCategory={tagsByCategory}
                canAddMore={canAddMore}
                animatingId={animatingId}
                onAdd={handleAdd}
                makeTagRef={makeTagRef}
              />
            </div>
            <div className={cn(
              "sticky bottom-0 flex justify-center py-2 pointer-events-none transition-opacity duration-300",
              showScrollHint ? "opacity-100" : "opacity-0"
            )}>
              <div className="w-11 h-11 rounded-full bg-ink-9 shadow-e-1 flex items-center justify-center">
                <ChevronDown className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
