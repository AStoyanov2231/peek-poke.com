import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface PremiumBadgeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showText?: boolean;
}

const SIZE_CLASSES = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;

const CONTAINER_CLASSES = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2 py-0.5 text-xs",
  lg: "px-2.5 py-1 text-sm",
} as const;

export function PremiumBadge({ size = "md", className, showText = false }: PremiumBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-pill bg-primary-500 text-white font-semibold",
        CONTAINER_CLASSES[size],
        className
      )}
    >
      <Sparkles className={SIZE_CLASSES[size]} />
      {showText && <span>Premium</span>}
    </div>
  );
}
