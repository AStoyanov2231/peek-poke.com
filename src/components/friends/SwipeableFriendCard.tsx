"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Minimum movement in pixels to consider it a swipe (prevents accidental swipes)
const SWIPE_THRESHOLD_PX = 10;
// Maximum swipe distance as percentage of card width
const MAX_SWIPE_PERCENT = 0.8;
// Swipe percentage required to trigger confirmation
const CONFIRM_THRESHOLD = 0.5;

interface SwipeableFriendCardProps {
  children: ReactNode;
  onSwipeComplete: () => void;
  disabled?: boolean;
}

export function SwipeableFriendCard({
  children,
  onSwipeComplete,
  disabled = false,
}: SwipeableFriendCardProps) {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  // Track if a meaningful swipe occurred to prevent click after swipe
  const didSwipeRef = useRef(false);
  // Track if we've determined swipe direction (horizontal vs vertical)
  const swipeDirectionRef = useRef<"horizontal" | "vertical" | null>(null);

  const getSwipePercentage = useCallback(() => {
    if (!containerRef.current) return 0;
    const width = containerRef.current.offsetWidth;
    return Math.abs(translateX) / width;
  }, [translateX]);

  const handleStart = useCallback(
    (clientX: number, clientY: number) => {
      if (disabled) return;
      startXRef.current = clientX;
      startYRef.current = clientY;
      currentXRef.current = clientX;
      didSwipeRef.current = false;
      swipeDirectionRef.current = null;
      setIsDragging(true);
    },
    [disabled]
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging || disabled) return;

      const diffX = clientX - startXRef.current;
      const diffY = clientY - startYRef.current;
      currentXRef.current = clientX;

      // Determine swipe direction on first significant movement
      if (swipeDirectionRef.current === null) {
        const absDiffX = Math.abs(diffX);
        const absDiffY = Math.abs(diffY);

        // Need at least some movement to determine direction
        if (absDiffX > 5 || absDiffY > 5) {
          swipeDirectionRef.current = absDiffX > absDiffY ? "horizontal" : "vertical";
        }
      }

      // Only handle horizontal swipes, let vertical pass through for scrolling
      if (swipeDirectionRef.current !== "horizontal") {
        return;
      }

      // Only allow swiping left (negative values)
      if (diffX < 0) {
        // Mark as swiped if moved more than threshold
        if (Math.abs(diffX) > SWIPE_THRESHOLD_PX) {
          didSwipeRef.current = true;
        }

        // Limit the swipe to MAX_SWIPE_PERCENT of the card width
        const maxSwipe = containerRef.current
          ? containerRef.current.offsetWidth * MAX_SWIPE_PERCENT
          : 200;
        setTranslateX(Math.max(diffX, -maxSwipe));
      } else {
        setTranslateX(0);
      }
    },
    [isDragging, disabled]
  );

  const handleEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const percentage = getSwipePercentage();

    if (percentage > CONFIRM_THRESHOLD) {
      // Swipe was more than threshold, trigger the confirmation
      onSwipeComplete();
    }

    // Reset the position
    setTranslateX(0);
  }, [isDragging, getSwipePercentage, onSwipeComplete]);

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleTouchEnd = () => {
    handleEnd();
  };

  // Mouse event handlers (for desktop testing)
  const handleMouseDown = (e: React.MouseEvent) => {
    handleStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      handleEnd();
    }
  };

  // Prevent click events after a swipe gesture
  const handleClickCapture = (e: React.MouseEvent) => {
    if (didSwipeRef.current) {
      e.stopPropagation();
      e.preventDefault();
      // Reset for next interaction
      didSwipeRef.current = false;
    }
  };

  const swipePercentage = getSwipePercentage();
  const isOverThreshold = swipePercentage > CONFIRM_THRESHOLD;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClickCapture={handleClickCapture}
    >
      {/* Red background indicator */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex items-center justify-end px-6 transition-colors duration-150",
          isOverThreshold ? "bg-destructive" : "bg-destructive/70"
        )}
        style={{
          width: Math.abs(translateX) + 20,
          opacity: Math.min(swipePercentage * 2, 1),
        }}
      >
        <Trash2
          className={cn(
            "h-6 w-6 text-white transition-transform duration-150",
            isOverThreshold && "scale-125"
          )}
        />
      </div>

      {/* Swipeable content */}
      <div
        className={cn(
          "relative bg-card",
          !isDragging && "transition-transform duration-200 ease-out"
        )}
        style={{
          transform: `translateX(${translateX}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
