import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PremiumBadgeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showText?: boolean;
}

export function PremiumBadge({
  size = "md",
  className,
  showText = false,
}: PremiumBadgeProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  const containerClasses = {
    sm: "px-1.5 py-0.5 text-xs",
    md: "px-2 py-1 text-sm",
    lg: "px-3 py-1.5 text-base",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white font-medium",
        containerClasses[size],
        className
      )}
    >
      <Crown className={sizeClasses[size]} />
      {showText && <span>Premium</span>}
    </div>
  );
}
