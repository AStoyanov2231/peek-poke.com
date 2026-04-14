"use client";

import { useHasRole } from "@/stores/selectors";
import { ModerationPageClient } from "@/components/moderation/ModerationPageClient";

export function ModerationSheetContent() {
  const isModerator = useHasRole("moderator");
  const isAdmin = useHasRole("admin");

  if (!isModerator && !isAdmin) {
    return <p className="text-muted-foreground text-center py-8">Access denied</p>;
  }

  return <ModerationPageClient />;
}
