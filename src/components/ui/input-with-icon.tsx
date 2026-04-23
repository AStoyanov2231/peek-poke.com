"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface InputWithIconProps extends React.ComponentProps<"input"> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

const InputWithIcon = React.forwardRef<HTMLInputElement, InputWithIconProps>(
  ({ className, label, error, icon, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <Label className="block mb-1.5">{label}</Label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-5">
              {icon}
            </span>
          )}
          <Input
            ref={ref}
            className={cn(
              icon && "pl-10",
              error && "ring-2 ring-danger-500/50 border-danger-500/50",
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="text-danger-500 text-xs mt-1">{error}</p>
        )}
      </div>
    );
  }
);
InputWithIcon.displayName = "InputWithIcon";

export { InputWithIcon };
