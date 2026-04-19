"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation";

const NEU_INSET = "inset 4px 4px 10px rgba(0,0,0,0.5), inset -3px -3px 8px rgba(255,255,255,0.25)";

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

  const showDent = variant === "subtle"
    ? isActive || isHovered || isPressed
    : isActive || isPressed;

  const buttonStyle = {
    background: "transparent",
    boxShadow: showDent ? NEU_INSET : "none",
    transition: "box-shadow 150ms ease-out",
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
        "relative rounded-xl",
        className
      )}
      style={buttonStyle}
    >
      {/* Icon slot */}
      <div className="relative flex-shrink-0 w-6 h-6 z-10">
        {/* Clip container keeps sliding icons inside the 24×24 box */}
        <div className="absolute inset-0 overflow-hidden">
          <Icon
            className="absolute inset-0 h-6 w-6 text-white"
            style={{
              transform: isActive ? "translateY(12px)" : "translateY(0)",
              opacity: isActive ? 0 : 1,
              transition: "transform 300ms ease-in-out, opacity 300ms ease-in-out",
            }}
            strokeWidth={2}
          />
          <ActiveIcon
            className="absolute inset-0 h-6 w-6 text-white"
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
