import { Skeleton } from "@/components/ui/skeleton";

export default function ModerationLoading() {
  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* Title skeleton */}
      <Skeleton className="h-10 w-48 mb-6" />

      {/* Tabs skeleton */}
      <div className="flex gap-2 mb-6">
        <Skeleton className="h-10 w-24 rounded-lg" />
        <Skeleton className="h-10 w-24 rounded-lg" />
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>

      {/* Photo grid skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    </div>
  );
}
