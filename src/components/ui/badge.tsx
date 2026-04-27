import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:     "bg-accent-500 text-white",
        primary:     "bg-primary-500 text-white",
        ink:         "bg-ink-9 text-white",
        secondary:   "bg-ink-2 text-ink-7",
        destructive: "bg-danger-500 text-white",
        outline:     "text-ink-7 border border-hairline bg-surface",
        dot:         "w-2 h-2 min-w-0 p-0 rounded-full bg-accent-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
