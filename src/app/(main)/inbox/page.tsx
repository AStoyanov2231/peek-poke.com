import { Suspense } from "react";
import { InboxClient } from "@/components/inbox/InboxClient";
import { InboxSkeleton } from "@/components/inbox/InboxSkeleton";

export default function InboxPage() {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <InboxClient />
    </Suspense>
  );
}
