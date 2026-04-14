"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation";

const NEU_RAISED_SM = "3px 3px 6px #A3B1C6, -3px -3px 6px #FFFFFF";
const NEU_INSET = "inset 4px 4px 8px #A3B1C6, inset -4px -4px 8px #FFFFFF";

interface NavButtonProps {
  item: NavItem;
  isActive: boolean;
  badgeCount: number;
  onClick: () => void;
  className?: string;
  children?: React.ReactNode;
  variant?: "default" | "subtle";
}

export function NavButton({ item, isActive, badgeCount, onClick, className, children, variant = "default" }: NavButtonProps) {
  const { icon: Icon, activeIcon: ActiveIcon, label } = item;
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const buttonStyle = variant === "subtle"
    ? {
        background: "hsl(var(--background))",
        transition: "box-shadow 150ms ease-out",
      }
    : {
        background: isActive ? "hsl(var(--background))" : "hsl(var(--primary))",
        boxShadow: isActive
          ? NEU_INSET
          : NEU_RAISED_SM,
        transition: "box-shadow 300ms ease-out, background 300ms ease-out",
      };

  return (
    <button
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      className={cn(
        "relative overflow-hidden rounded-xl",
        variant === "subtle" && (isHovered || isActive || isPressed) && "shadow-neu-inset-sm",
        className
      )}
      style={buttonStyle}
    >
      {/* Icon slot */}
      <div className="relative flex-shrink-0 w-6 h-6 z-10">
        {/* Clip container keeps sliding icons inside the 24×24 box */}
        <div className="absolute inset-0 overflow-hidden">
          <Icon
            className={cn("absolute inset-0 h-6 w-6", variant === "subtle" ? "text-muted-foreground" : "text-white")}
            style={{
              transform: isActive ? "translateY(12px)" : "translateY(0)",
              opacity: isActive ? 0 : 1,
              transition: "transform 300ms ease-in-out, opacity 300ms ease-in-out",
            }}
            strokeWidth={2}
          />
          <ActiveIcon
            className="absolute inset-0 h-6 w-6 text-primary"
            style={{
              transform: isActive ? "translateY(0)" : "translateY(12px)",
              opacity: isActive ? 1 : 0,
              transition: "transform 300ms ease-in-out, opacity 300ms ease-in-out",
            }}
            strokeWidth={2.5}
          />
        </div>

        {/* Badge sits outside the clip container so it's never clipped */}
        {badgeCount > 0 && (
          <Badge className="absolute -top-1.5 -right-2.5 h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full text-[10px] font-semibold bg-destructive text-destructive-foreground shadow-sm">
            {badgeCount > 9 ? "9+" : badgeCount}
          </Badge>
        )}
      </div>

      {children}
    </button>
  );
}
