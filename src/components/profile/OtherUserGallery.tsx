"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { PhotoViewerDialog } from "@/components/ui/PhotoViewerDialog";
import { BlurredPhoto } from "./BlurredPhoto";
import { cn } from "@/lib/utils";
import type { ProfilePhoto } from "@/types/database";

interface OtherUserGalleryProps {
  photos: ProfilePhoto[];
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

  // Only show approved photos to other users
  const approvedPhotos = photos.filter((p) => p.approval_status === "approved");
  const publicPhotos = approvedPhotos.filter((p) => !p.is_private);
  const privatePhotos = approvedPhotos.filter((p) => p.is_private);

  // If viewer is premium, they see all approved photos (public + private)
  // Non-premium users only see approved public photos
  const visiblePhotos = viewerIsPremium ? approvedPhotos : publicPhotos;

  const openViewer = (index: number) => {
    if (!viewerIsPremium && approvedPhotos[index]?.is_private) {
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
          const canView = viewerIsPremium || !isPrivate;

          if (!canView) {
            return (
              <BlurredPhoto
                key={photo.id}
                src={photo.thumbnail_url || photo.url}
                className="aspect-square rounded-lg"
              />
            );
          }

          return (
            <div
              key={photo.id}
              className="relative aspect-square group cursor-pointer overflow-hidden rounded-lg"
              onClick={() => openViewer(index)}
            >
              <img
                src={photo.thumbnail_url || photo.url}
                alt=""
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
