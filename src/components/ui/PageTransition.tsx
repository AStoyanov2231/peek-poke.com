"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  variant?: "fade" | "slide-up" | "slide-right" | "scale";
}

const variantClasses = {
  fade: "animate-[fadeIn_0.3s_ease-out]",
  "slide-up": "animate-[slideUp_0.3s_ease-out]",
  "slide-right": "animate-[slideRight_0.3s_ease-out]",
  scale: "animate-[scaleIn_0.3s_ease-out]",
};

export function PageTransition({
  children,
  className,
  variant = "fade",
}: PageTransitionProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Small delay to ensure the animation plays
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(
        isVisible ? variantClasses[variant] : "opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}

// Staggered list animation for list items
interface StaggeredListProps {
  children: React.ReactNode[];
  className?: string;
  itemClassName?: string;
  staggerDelay?: number;
}

export function StaggeredList({
  children,
  className,
  itemClassName,
  staggerDelay = 50,
}: StaggeredListProps) {
  return (
    <div className={className}>
      {React.Children.map(children, (child, index) => (
        <div
          key={React.isValidElement(child) ? child.key ?? index : index}
          className={cn("animate-[slideUp_0.3s_ease-out_forwards]", itemClassName)}
          style={{
            animationDelay: `${index * staggerDelay}ms`,
            opacity: 0,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
