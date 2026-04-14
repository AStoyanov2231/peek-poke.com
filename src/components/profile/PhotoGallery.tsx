"use client";

import { useState, useRef } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { Camera } from "@phosphor-icons/react";
import { PhotoViewerDialog } from "@/components/ui/PhotoViewerDialog";
import { PhotoCard } from "@/components/profile/PhotoCard";
import { cn } from "@/lib/utils";
import type { ProfilePhoto } from "@/types/database";

interface PhotoGalleryProps {
  photos: ProfilePhoto[];
  isOwner: boolean;
  maxPhotos?: number;
  onUpload?: (file: File) => Promise<void>;
  onDelete?: (photoId: string) => Promise<void>;
  onSetAvatar?: (photoId: string) => Promise<void>;
  onTogglePrivate?: (photoId: string, isPrivate: boolean) => Promise<void>;
  className?: string;
}

export function PhotoGallery({
  photos,
  isOwner,
  maxPhotos = 12,
  onUpload,
  onDelete,
  onSetAvatar,
  onTogglePrivate,
  className,
}: PhotoGalleryProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingAvatarId, setSettingAvatarId] = useState<string | null>(null);
  const [togglingPrivateId, setTogglingPrivateId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUpload = photos.length < maxPhotos;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;

    setIsUploading(true);
    try {
      await onUpload(file);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (photoId: string) => {
    if (!onDelete) return;
    setDeletingId(photoId);
    setMenuOpen(null);
    try {
      await onDelete(photoId);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetAvatar = async (photoId: string) => {
    if (!onSetAvatar) return;
    setSettingAvatarId(photoId);
    setMenuOpen(null);
    try {
      await onSetAvatar(photoId);
    } finally {
      setSettingAvatarId(null);
    }
  };

  const handleTogglePrivate = async (photoId: string, currentPrivate: boolean) => {
    if (!onTogglePrivate) return;
    setTogglingPrivateId(photoId);
    setMenuOpen(null);
    try {
      await onTogglePrivate(photoId, !currentPrivate);
    } finally {
      setTogglingPrivateId(null);
    }
  };

  const openViewer = (index: number) => {
    setCurrentIndex(index);
    setViewerOpen(true);
  };

  if (photos.length === 0 && !isOwner) {
    return null;
  }

  return (
    <div className={cn("px-4 md:px-6 py-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[16px] font-semibold text-foreground">Photos ({photos.length}/{maxPhotos})</h3>
        {isOwner && canUpload && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="bg-primary rounded-sm px-3 py-1.5 text-xs font-medium text-white flex items-center gap-1.5 disabled:opacity-50 shadow-neu-raised-sm"
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" weight="fill" />
              )}
              Add Photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </>
        )}
      </div>

      {photos.length === 0 ? (
        <div
          className={cn(
            "flex flex-col items-center justify-center py-12 rounded-xl border-2 border-dashed border-muted-foreground/20",
            isOwner && "cursor-pointer hover:border-primary/40 transition-colors"
          )}
          onClick={() => isOwner && fileInputRef.current?.click()}
        >
          <ImageIcon className="h-12 w-12 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            {isOwner ? "Add photos" : "No photos yet"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1 md:gap-2">
          {photos.map((photo, index) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              index={index}
              isOwner={isOwner}
              menuOpen={menuOpen}
              isDeleting={deletingId === photo.id}
              isSettingAvatar={settingAvatarId === photo.id}
              isTogglingPrivate={togglingPrivateId === photo.id}
              onOpenViewer={openViewer}
              onToggleMenu={setMenuOpen}
              onDelete={handleDelete}
              onSetAvatar={handleSetAvatar}
              onTogglePrivate={handleTogglePrivate}
            />
          ))}
        </div>
      )}

      {/* Photo Viewer Dialog */}
      <PhotoViewerDialog
        photos={photos}
        currentIndex={currentIndex}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        onIndexChange={setCurrentIndex}
      />

      {/* Close menu when clicking outside */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setMenuOpen(null)}
        />
      )}
    </div>
  );
}
