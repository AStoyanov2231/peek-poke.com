import {
  Coffee,
  Utensils,
  Footprints,
  Dumbbell,
  BookOpen,
  Wine,
  Gamepad2,
  Compass,
  Sparkles,
  Plus,
} from "lucide-react";
import type { Activity } from "@peekpoke/shared";
export const activities = [
  { id: "coffee", label: "Coffee", Icon: Coffee },
  { id: "food", label: "Food", Icon: Utensils },
  { id: "walk", label: "Walk", Icon: Footprints },
  { id: "gym", label: "Gym", Icon: Dumbbell },
  { id: "study", label: "Study", Icon: BookOpen },
  { id: "drinks", label: "Drinks", Icon: Wine },
  { id: "gaming", label: "Gaming", Icon: Gamepad2 },
  { id: "explore", label: "Explore", Icon: Compass },
  { id: "anything", label: "Anything", Icon: Sparkles },
  { id: "custom", label: "Your thing", Icon: Plus },
] as const;
export function activityInfo(activity: Activity | string) {
  return (
    activities.find((item) => item.id === activity.toLowerCase()) ??
    activities[8]
  );
}
export function remainingAvailability(expiresAt: string, now: number) {
  const minutes = Math.ceil((Date.parse(expiresAt) - now) / 60_000);
  if (minutes <= 0) return "Availability ended";
  if (minutes < 60) return `Free for ${minutes} min`;
  return `Free until ${new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}
