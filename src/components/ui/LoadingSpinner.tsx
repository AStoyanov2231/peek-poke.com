"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "paw" | "cat";
  className?: string;
}

const sizeClasses = {
  sm: "w-5 h-5",
  md: "w-8 h-8",
  lg: "w-12 h-12",
};

export function LoadingSpinner({
  size = "md",
  variant = "default",
  className,
}: LoadingSpinnerProps) {
  if (variant === "paw") {
    return (
      <div className={cn("relative", sizeClasses[size], className)}>
        <svg
          viewBox="0 0 40 40"
          className="w-full h-full animate-spin-slow"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Main pad */}
          <ellipse cx="20" cy="24" rx="10" ry="9" className="fill-cat-pink" />
          {/* Toe pads */}
          <ellipse cx="10" cy="12" rx="5" ry="4.5" className="fill-cat-pink/80" />
          <ellipse cx="20" cy="8" rx="5" ry="4.5" className="fill-cat-pink/80" />
          <ellipse cx="30" cy="12" rx="5" ry="4.5" className="fill-cat-pink/80" />
        </svg>
      </div>
    );
  }

  if (variant === "cat") {
    return (
      <div className={cn("relative", sizeClasses[size], className)}>
        <svg
          viewBox="0 0 50 50"
          className="w-full h-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Cat face */}
          <circle cx="25" cy="28" r="16" className="fill-cat-pink/30" />
          {/* Ears */}
          <path d="M12 15 L16 26 L8 24 Z" className="fill-cat-pink/40" />
          <path d="M38 15 L34 26 L42 24 Z" className="fill-cat-pink/40" />
          {/* Eyes - blinking animation */}
          <g className="animate-pulse">
            <ellipse cx="19" cy="26" rx="3" ry="3" className="fill-foreground/60" />
            <ellipse cx="31" cy="26" rx="3" ry="3" className="fill-foreground/60" />
          </g>
          {/* Nose */}
          <ellipse cx="25" cy="32" rx="2" ry="1.5" className="fill-cat-pink" />
          {/* Animated whiskers */}
          <g className="origin-center">
            <path
              d="M15 30 L5 28 M15 33 L5 35"
              className="stroke-foreground/40 animate-pulse"
              strokeWidth="1"
              strokeLinecap="round"
            />
            <path
              d="M35 30 L45 28 M35 33 L45 35"
              className="stroke-foreground/40 animate-pulse"
              strokeWidth="1"
              strokeLinecap="round"
              style={{ animationDelay: "0.5s" }}
            />
          </g>
        </svg>
        {/* Rotating dots around the cat */}
        <div className="absolute inset-0 animate-spin-slow">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-accent" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cat-pink" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
        </div>
      </div>
    );
  }

  // Default branded spinner
  const gradientId = useId();

  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      <svg
        className="w-full h-full animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          className="text-muted opacity-25"
        />
        <path
          d="M12 2C6.48 2 2 6.48 2 12"
          stroke={`url(#${gradientId})`}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--accent))" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

// Full page loading state with cat
export function PageLoader({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <LoadingSpinner size="lg" variant="cat" />
      <p className="text-sm text-muted-foreground animate-pulse">{message}</p>
    </div>
  );
}
