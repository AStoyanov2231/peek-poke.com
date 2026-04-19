"use client";

import { cn } from "@/lib/utils";
import { getCategoryEmoji } from "@/lib/constants";
import type { InterestTag } from "@/types/database";

interface InterestPickerProps {
  tagsByCategory: Record<string, InterestTag[]>;
  canAddMore: boolean;
  animatingId: string | null;
  onAdd: (tag: InterestTag) => void;
  makeTagRef: (tagId: string) => (el: HTMLElement | null) => void;
}

export function InterestPicker({
  tagsByCategory,
  canAddMore,
  animatingId,
  onAdd,
  makeTagRef,
}: InterestPickerProps) {
  return (
    <div className="mt-2 space-y-4">
      {Object.entries(tagsByCategory).map(([category, tags]) => (
        <div key={category}>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            {getCategoryEmoji(category)} {category}
          </h4>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isAnimating = animatingId === tag.id;
              const disabled = !canAddMore || !!animatingId;
              return (
                <button
                  key={tag.id}
                  ref={makeTagRef(tag.id)}
                  onClick={() => onAdd(tag)}
                  disabled={disabled}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium bg-background shadow-neu-raised-sm text-foreground",
                    disabled && !isAnimating && "opacity-40 cursor-not-allowed"
                  )}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {Object.keys(tagsByCategory).length === 0 && (
        <p className="text-sm text-muted-foreground italic text-center py-2">
          All interests selected
        </p>
      )}
    </div>
  );
}
