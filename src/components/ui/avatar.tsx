"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

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

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-neu-sunken",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

// Avatar with online status indicator
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

const statusSizeClasses = {
  sm: "w-2 h-2 right-0 bottom-0",
  md: "w-3 h-3 right-0 bottom-0",
  lg: "w-3.5 h-3.5 right-0.5 bottom-0.5",
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
        <AvatarFallback className="text-foreground font-medium">
          {(fallback || "??").slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {status && (
        <span
          className={cn(
            "absolute border-2 border-background rounded-full",
            statusSizeClasses[size],
            status === "online" && "status-online presence-pulse",
            status === "away" && "status-away",
            status === "offline" && "status-offline"
          )}
        />
      )}
    </div>
  );
}

export { Avatar, AvatarImage, AvatarFallback, AvatarWithStatus }
