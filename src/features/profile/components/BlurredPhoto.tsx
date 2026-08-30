"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface BlurredPhotoProps {
  alt?: string;
  className?: string;
  onClick?: () => void;
}

export function BlurredPhoto({
  alt = "",
  className,
  onClick,
}: BlurredPhotoProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden cursor-pointer group",
        className
      )}
      role="button"
      tabIndex={0}
      aria-label={alt}
      onClick={onClick}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick?.(); } }}
    >
      <div
        aria-label={alt}
        className="absolute inset-0 bg-gradient-to-br from-primary-200 via-primary-400 to-primary-700"
      />
      <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center">
        <div className="p-3 rounded-full bg-white/20 backdrop-blur-sm mb-2">
          <Lock className="h-6 w-6 text-white" />
        </div>
        <span className="text-white text-sm font-medium">Premium Only</span>
      </div>
    </div>
  );
}
