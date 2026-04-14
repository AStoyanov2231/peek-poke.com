import { Skeleton } from "@/components/ui/skeleton";

export function InboxSkeleton() {
  return (
    <div className="flex flex-col h-[100svh] overflow-hidden">
      <div className="px-4 pb-4 border-b flex-shrink-0">
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="flex gap-3 px-4 py-3 border-b flex-shrink-0">
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <div className="flex-1 px-4 pt-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3 items-center">
            <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
