import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Enable shimmer effect instead of pulse. Defaults to false for backwards compatibility. */
  shimmer?: boolean;
}

function Skeleton({
  className,
  shimmer = false,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-md bg-neu-sunken shadow-neu-inset",
        shimmer ? "skeleton-shimmer" : "animate-pulse",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
