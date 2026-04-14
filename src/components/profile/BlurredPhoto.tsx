"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface BlurredPhotoProps {
  src: string;
  alt?: string;
  className?: string;
  onClick?: () => void;
}

export function BlurredPhoto({
  src,
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
      onClick={onClick}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover filter blur-xl scale-110"
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
