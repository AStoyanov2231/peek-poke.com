import { Suspense } from "react";
import { InboxClient } from "@/features/inbox/components/InboxClient";
import { InboxSkeleton } from "@/features/inbox/components/InboxSkeleton";

export default function InboxPage() {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <InboxClient />
    </Suspense>
  );
}
