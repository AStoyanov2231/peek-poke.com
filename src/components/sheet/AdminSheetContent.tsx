"use client";

import { useHasRole } from "@/stores/selectors";
import { AdminPageClient } from "@/components/admin/AdminPageClient";

export function AdminSheetContent() {
  const isAdmin = useHasRole("admin");

  if (!isAdmin) {
    return <p className="text-muted-foreground text-center py-8">Access denied</p>;
  }

  return <AdminPageClient />;
}
