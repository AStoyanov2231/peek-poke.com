"use client";

import { useQuery } from "@tanstack/react-query";
import { useProfile, usePhotos, useInterests, useAllTags, useProfileStats, useIsProfileLoaded } from "@/stores/selectors";
import { ProfilePageClient } from "@/features/profile/components/ProfilePageClient";
import { RestoredScroll } from "@/features/layout/components/RestoredScroll";
import { Skeleton } from "@/components/ui/skeleton";
import {
  interestTagsQueryOptions,
  interestsQueryOptions,
  photosQueryOptions,
  profileQueryOptions,
} from "@/data/web-query";

export default function ProfilePage() {
  const profileQuery = useQuery(profileQueryOptions);
  const photosQuery = useQuery(photosQueryOptions);
  const interestsQuery = useQuery(interestsQueryOptions);
  const tagsQuery = useQuery(interestTagsQueryOptions);
  const profile = useProfile();
  const photos = usePhotos();
  const interests = useInterests();
  const allTags = useAllTags();
  const stats = useProfileStats();
  const isLoaded = useIsProfileLoaded();
  const queries = [profileQuery, photosQuery, interestsQuery, tagsQuery];

  if (queries.some((query) => query.isError)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="t-body text-ink-9">Your profile could not be loaded.</p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void Promise.all(queries.map((query) => query.refetch()))}
        >
          Try again
        </button>
      </div>
    );
  }

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
    <RestoredScroll storageKey="profile" className="h-full overflow-y-auto bg-background">
      <ProfilePageClient
        key={profile.id}
        profile={profile}
        photos={photos}
        interests={interests}
        allTags={allTags}
        stats={stats}
      />
    </RestoredScroll>
  );
}
