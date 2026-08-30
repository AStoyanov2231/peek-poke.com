import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="relative w-full h-screen">
      {/* Map placeholder */}
      <Skeleton className="w-full h-full" />

      {/* Radius buttons skeleton */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-9 w-16 rounded-full" />
        ))}
      </div>
    </div>
  );
}
