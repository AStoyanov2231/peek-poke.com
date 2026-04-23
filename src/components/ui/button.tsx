import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        // ── New canonical variants ──
        primary:
          "bg-ink-9 text-white hover:bg-ink-8 rounded-sm",
        accent:
          "bg-primary-500 text-white hover:bg-primary-600 rounded-sm",
        secondary:
          "bg-surface text-ink-8 shadow-e-1 hover:bg-ink-1 rounded-sm",
        ghost:
          "bg-transparent text-ink-7 hover:bg-ink-2 rounded-sm",
        danger:
          "bg-danger-500 text-white hover:bg-danger-500/90 rounded-sm",
        // ── Backward-compat aliases ──
        default:
          "bg-surface text-ink-8 shadow-e-1 hover:bg-ink-1 rounded-sm",
        destructive:
          "bg-danger-500 text-white shadow-e-1 hover:bg-danger-500/90 rounded-sm",
        outline:
          "bg-surface text-ink-8 shadow-e-1 hover:bg-ink-1 rounded-sm",
        link:
          "text-primary-500 underline-offset-4 hover:underline",
        success:
          "bg-primary-500 text-white shadow-e-1 hover:bg-primary-600 rounded-sm",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm:      "h-8 px-3 text-xs rounded-sm",
        md:      "h-10 px-4 rounded-md",
        lg:      "h-12 px-6 text-base rounded-md",
        xl:      "h-14 px-8 text-base rounded-lg",
        icon:    "h-9 w-9 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
