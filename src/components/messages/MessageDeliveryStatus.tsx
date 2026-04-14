"use client";

import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type DeliveryStatus = "sending" | "sent" | "delivered" | "read";

interface MessageDeliveryStatusProps {
  status: DeliveryStatus;
  className?: string;
}

export function MessageDeliveryStatus({ status, className }: MessageDeliveryStatusProps) {
  if (status === "sending") {
    return (
      <div className={cn("w-3 h-3 rounded-full border border-current animate-pulse-soft", className)} />
    );
  }

  if (status === "sent") {
    return (
      <Check className={cn("w-3.5 h-3.5 checkmark-sent", className)} />
    );
  }

  if (status === "delivered") {
    return (
      <CheckCheck className={cn("w-3.5 h-3.5 checkmark-delivered", className)} />
    );
  }

  // Read status
  return (
    <CheckCheck className={cn("w-3.5 h-3.5 checkmark-read", className)} />
  );
}
