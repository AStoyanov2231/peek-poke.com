"use client";

import { useState } from "react";
import Image from "next/image";
import { Lock } from "lucide-react";
import { PhotoViewerDialog } from "@/components/ui/PhotoViewerDialog";
import { BlurredPhoto } from "./BlurredPhoto";
import { cn } from "@/lib/utils";
import type { PublicProfilePhoto } from "@peekpoke/shared";

interface OtherUserGalleryProps {
  photos: PublicProfilePhoto[];
  viewerIsPremium: boolean;
  className?: string;
}

export function OtherUserGallery({
  photos,
  viewerIsPremium,
  className,
}: OtherUserGalleryProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const approvedPhotos = photos;
  const privatePhotos = approvedPhotos.filter((photo) => photo.is_private);
  const visiblePhotos = approvedPhotos.filter(
    (photo): photo is PublicProfilePhoto & { url: string } =>
      photo.access === "viewable" && photo.url !== null,
  );

  const openViewer = (index: number) => {
    if (approvedPhotos[index]?.access !== "viewable") {
      return; // Don't open viewer for private photos if not premium
    }
    // Find the index in visiblePhotos array
    const photo = approvedPhotos[index];
    const visibleIndex = visiblePhotos.findIndex((p) => p.id === photo.id);
    if (visibleIndex >= 0) {
      setCurrentIndex(visibleIndex);
      setViewerOpen(true);
    }
  };

  // Show nothing if no approved photos
  if (approvedPhotos.length === 0) {
    return null;
  }

  return (
    <div className={cn("px-4 md:px-6 py-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Photos ({approvedPhotos.length})
          {!viewerIsPremium && privatePhotos.length > 0 && (
            <span className="ml-2 text-xs">
              <Lock className="inline h-3 w-3 mr-1" />
              {privatePhotos.length} private
            </span>
          )}
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-1 md:gap-2">
        {approvedPhotos.map((photo, index) => {
          const isPrivate = photo.is_private;
          const canView = photo.access === "viewable" && photo.url !== null;

          if (!canView || photo.url === null) {
            return (
              <BlurredPhoto
                key={photo.id}
                className="aspect-square rounded-lg"
              />
            );
          }

          return (
            <div
              key={photo.id}
              className="relative aspect-square group cursor-pointer overflow-hidden rounded-lg"
              onClick={() => openViewer(index)}
              role="button"
              tabIndex={0}
              aria-label="View photo"
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openViewer(index); } }}
            >
              <Image
                src={photo.thumbnail_url ?? photo.url}
                alt=""
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
              {isPrivate && viewerIsPremium && (
                <div className="absolute top-1 right-1 p-1 rounded-full bg-black/50">
                  <Lock className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Photo Viewer Dialog */}
      <PhotoViewerDialog
        photos={visiblePhotos}
        currentIndex={currentIndex}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        onIndexChange={setCurrentIndex}
      />
    </div>
  );
}
