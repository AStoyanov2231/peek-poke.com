import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function ProfileLoading() {
  return (
    <div className="max-w-2xl mx-auto p-4">
      <Card className="p-6">
        {/* Avatar and name section */}
        <div className="flex items-start gap-4 mb-6">
          <Skeleton className="h-24 w-24 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 mb-6">
          <Skeleton className="h-16 flex-1 rounded-lg" />
          <Skeleton className="h-16 flex-1 rounded-lg" />
          <Skeleton className="h-16 flex-1 rounded-lg" />
        </div>

        {/* Bio section */}
        <Skeleton className="h-20 w-full rounded-lg" />
      </Card>
    </div>
  );
}
