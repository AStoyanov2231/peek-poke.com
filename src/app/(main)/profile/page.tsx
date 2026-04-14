"use client";

import { useProfile, usePhotos, useInterests, useAllTags, useProfileStats, useIsProfileLoaded } from "@/stores/selectors";
import { ProfilePageClient } from "@/components/profile/ProfilePageClient";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfilePage() {
  const profile = useProfile();
  const photos = usePhotos();
  const interests = useInterests();
  const allTags = useAllTags();
  const stats = useProfileStats();
  const isLoaded = useIsProfileLoaded();

  if (!isLoaded || !profile) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-24 w-24 rounded-full mx-auto" />
        <Skeleton className="h-6 w-48 mx-auto" />
        <Skeleton className="h-4 w-32 mx-auto" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <ProfilePageClient
        profile={profile}
        photos={photos}
        interests={interests}
        allTags={allTags}
        stats={stats}
      />
    </div>
  );
}
