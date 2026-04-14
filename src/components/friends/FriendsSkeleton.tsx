import { Skeleton } from "@/components/ui/skeleton";

export function FriendsSkeleton() {
  return (
    <>
      <Skeleton className="h-10 w-64 mb-4" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </>
  );
}
