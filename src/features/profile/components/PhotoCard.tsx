"use client";

import {
  Star,
  X,
  Loader2,
  MoreVertical,
  Lock,
  Clock,
  AlertCircle,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { OwnerProfilePhoto } from "@peekpoke/shared";

interface PhotoCardProps {
  photo: OwnerProfilePhoto;
  index: number;
  owner?: {
    menuOpen: string | null;
    isDeleting: boolean;
    isSettingAvatar: boolean;
    isTogglingPrivate: boolean;
  };
  masonry?: boolean;
  onOpenViewer: (index: number) => void;
  onToggleMenu: (photoId: string | null) => void;
}

export function PhotoCard({
  photo,
  index,
  owner,
  masonry = false,
  onOpenViewer,
  onToggleMenu,
}: PhotoCardProps) {
  const isOwner = owner !== undefined;
  const { menuOpen, isDeleting, isSettingAvatar, isTogglingPrivate } = owner ?? {
    menuOpen: null,
    isDeleting: false,
    isSettingAvatar: false,
    isTogglingPrivate: false,
  };
  const isLoading = isDeleting || isSettingAvatar || isTogglingPrivate;

  return (
    <div
      className={cn(
        "relative group cursor-pointer overflow-hidden rounded-lg",
        masonry ? "w-full" : "aspect-square"
      )}
    >
      <button type="button" className="block h-full w-full" aria-label="View photo" disabled={!photo.url} onClick={() => onOpenViewer(index)}>
        {photo.url ? (
          <Image
            src={masonry ? photo.url : (photo.thumbnail_url || photo.url)}
            alt=""
            width={800}
            height={600}
            className={cn(
              "w-full object-cover",
              masonry ? "h-auto max-h-64" : "h-full transition-transform group-hover:scale-105",
              (isDeleting || isSettingAvatar) && "opacity-50"
            )}
          />
        ) : (
          <span className="flex h-full min-h-24 items-center justify-center bg-muted px-2 text-center text-xs text-muted-foreground">
            Media removed
          </span>
        )}
      </button>

      {/* Rejected photo overlay */}
      {photo.approval_status === "rejected" && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
          <X className="h-16 w-16 text-destructive drop-shadow-lg" />
        </div>
      )}

      {/* Avatar indicator */}
      {photo.is_avatar && (
        <div className="absolute top-1 left-1 bg-ink-9 text-primary-foreground p-1 rounded-full">
          <Star className="h-3 w-3" />
        </div>
      )}

      {/* Private indicator */}
      {photo.is_private && isOwner && (
        <div className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full">
          <Lock className="h-3 w-3" />
        </div>
      )}

      {/* Approval status indicator for owner */}
      {isOwner && photo.approval_status === "pending" && (
        <div className="absolute bottom-1 left-1 bg-yellow-500/90 text-white text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />
          <span>Pending</span>
        </div>
      )}
      {isOwner && photo.approval_status === "rejected" && (
        <div
          className="absolute bottom-1 left-1 bg-red-500/90 text-white text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 cursor-help"
          title={photo.rejection_reason || "Photo rejected"}
        >
          <AlertCircle className="h-2.5 w-2.5" />
          <span>Rejected</span>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Loader2 className="h-6 w-6 text-white animate-spin" />
        </div>
      )}

      {/* Hover overlay with menu */}
      {isOwner && !isLoading && (
        <div className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors">
          <button type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu(menuOpen === photo.id ? null : photo.id);
            }}
            className={cn(
              "pointer-events-auto",
              "absolute top-1 p-1.5 rounded-full bg-black/50 text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100",
              photo.is_private ? "right-8" : "right-1"
            )}
            aria-label="Manage photo"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
