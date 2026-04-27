import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface PremiumBadgeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showText?: boolean;
}

export function PremiumBadge({ size = "md", className, showText = false }: PremiumBadgeProps) {
  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const containerClasses = {
    sm: "px-1.5 py-0.5 text-[10px]",
    md: "px-2 py-0.5 text-xs",
    lg: "px-2.5 py-1 text-sm",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-pill bg-primary-500 text-white font-semibold",
        containerClasses[size],
        className
      )}
    >
      <Sparkles className={sizeClasses[size]} />
      {showText && <span>Premium</span>}
    </div>
  );
}
