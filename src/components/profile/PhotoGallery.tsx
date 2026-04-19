"use client";

import { useState, useRef, useEffect } from "react";
import { ImageIcon, Loader2, ChevronDown } from "lucide-react";
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
  const gridRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  const checkScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setShowScrollHint(el.scrollHeight > el.clientHeight + 8 && el.scrollTop + el.clientHeight < el.scrollHeight - 8);
  };

  useEffect(() => {
    const t = setTimeout(checkScroll, 50);
    return () => clearTimeout(t);
  }, [photos.length]);

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

  const emptyCount = isOwner && canUpload ? 1 : 0;

  return (
    <div ref={containerRef} onScroll={checkScroll} className={cn("px-4 md:px-6 py-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[16px] font-semibold text-foreground">Photos ({photos.length}/{maxPhotos})</h3>
      </div>
      {isOwner && (
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
      )}

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
        <>
          <div ref={gridRef} className="grid grid-cols-3 gap-1 md:gap-2">
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
            {Array.from({ length: emptyCount }).map((_, i) =>
              i === 0 && isOwner && canUpload ? (
                <button
                  key="cta"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="aspect-square rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 flex flex-col items-center justify-center gap-1 text-primary/50 hover:border-primary/60 hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
                >
                  {isUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" weight="fill" />}
                  <span className="text-[11px] font-medium">Add Photo</span>
                </button>
              ) : (
                <div key={`empty-${i}`} className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/30" />
              )
            )}
          </div>
          <div className={cn(
            "sticky bottom-0 flex justify-center py-2 pointer-events-none transition-opacity duration-300",
            showScrollHint ? "opacity-100" : "opacity-0"
          )}>
            <div className="w-11 h-11 rounded-full bg-primary-gradient shadow-neu-raised-sm flex items-center justify-center">
              <ChevronDown className="h-5 w-5 text-white" />
            </div>
          </div>
        </>
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
