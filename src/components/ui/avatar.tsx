"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { avatarColor } from "@/lib/avatar-color"
import { cn } from "@/lib/utils"

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full object-cover", className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

interface AvatarFallbackProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback> {
  name?: string;
}

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  AvatarFallbackProps
>(({ className, name, style, children, ...props }, ref) => {
  const pal = name ? avatarColor(name) : { bg: 'var(--ink-2)', fg: 'var(--ink-7)' };
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full font-semibold text-sm",
        className
      )}
      style={{ background: pal.bg, color: pal.fg, ...style }}
      {...props}
    >
      {children ?? (name ? name[0].toUpperCase() : '?')}
    </AvatarPrimitive.Fallback>
  );
})
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

interface AvatarWithStatusProps {
  src?: string | null;
  fallback: string;
  status?: "online" | "away" | "offline";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
};

const statusDotClasses = {
  sm: "w-2 h-2 right-0 bottom-0",
  md: "w-2.5 h-2.5 right-0 bottom-0",
  lg: "w-3 h-3 right-0.5 bottom-0.5",
};

function AvatarWithStatus({
  src,
  fallback,
  status,
  size = "md",
  className,
}: AvatarWithStatusProps) {
  return (
    <div className={cn("relative inline-block", className)}>
      <Avatar className={sizeClasses[size]}>
        {src && <AvatarImage src={src} alt={fallback} />}
        <AvatarFallback name={fallback}>
          {(fallback || "??").slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {status === "online" && (
        <span
          className={cn(
            "absolute border-2 border-white rounded-full status-online presence-pulse",
            statusDotClasses[size]
          )}
        />
      )}
      {status === "offline" && (
        <span
          className={cn(
            "absolute border-2 border-white rounded-full status-offline",
            statusDotClasses[size]
          )}
        />
      )}
    </div>
  );
}

export { Avatar, AvatarImage, AvatarFallback, AvatarWithStatus }
