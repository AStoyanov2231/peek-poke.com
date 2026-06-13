"use client";

import { useHasRole, useIsProfileLoaded } from "@/stores/selectors";
import { AdminPageClient } from "@/components/admin/AdminPageClient";
import { RestoredScroll } from "@/components/layout/RestoredScroll";

export default function AdminPage() {
  const isLoaded = useIsProfileLoaded();
  const isAdmin = useHasRole("admin");

  if (!isLoaded) return null;

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Access denied</p>
      </div>
    );
  }

  return (
    <RestoredScroll storageKey="admin" className="h-full overflow-y-auto bg-background">
      <AdminPageClient />
    </RestoredScroll>
  );
}
