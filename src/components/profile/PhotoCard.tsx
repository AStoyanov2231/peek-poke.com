"use client";

import {
  Star,
  Trash2,
  X,
  Loader2,
  MoreVertical,
  Lock,
  Unlock,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProfilePhoto } from "@/types/database";

interface PhotoCardProps {
  photo: ProfilePhoto;
  index: number;
  isOwner: boolean;
  menuOpen: string | null;
  isDeleting: boolean;
  isSettingAvatar: boolean;
  isTogglingPrivate: boolean;
  onOpenViewer: (index: number) => void;
  onToggleMenu: (photoId: string | null) => void;
  onDelete: (photoId: string) => void;
  onSetAvatar: (photoId: string) => void;
  onTogglePrivate: (photoId: string, currentPrivate: boolean) => void;
}

export function PhotoCard({
  photo,
  index,
  isOwner,
  menuOpen,
  isDeleting,
  isSettingAvatar,
  isTogglingPrivate,
  onOpenViewer,
  onToggleMenu,
  onDelete,
  onSetAvatar,
  onTogglePrivate,
}: PhotoCardProps) {
  const isLoading = isDeleting || isSettingAvatar || isTogglingPrivate;

  return (
    <div
      className="relative aspect-square group cursor-pointer overflow-hidden rounded-lg"
      onClick={() => onOpenViewer(index)}
    >
      <img
        src={photo.thumbnail_url || photo.url}
        alt=""
        className={cn(
          "w-full h-full object-cover transition-transform group-hover:scale-105",
          (isDeleting || isSettingAvatar) && "opacity-50"
        )}
      />

      {/* Rejected photo overlay */}
      {photo.approval_status === "rejected" && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
          <X className="h-16 w-16 text-destructive drop-shadow-lg" />
        </div>
      )}

      {/* Avatar indicator */}
      {photo.is_avatar && (
        <div className="absolute top-1 left-1 bg-primary-gradient text-primary-foreground p-1 rounded-full">
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
        <div className="absolute bottom-1 left-1 bg-yellow-500/90 text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />
          <span>Pending</span>
        </div>
      )}
      {isOwner && photo.approval_status === "rejected" && (
        <div
          className="absolute bottom-1 left-1 bg-red-500/90 text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 cursor-help"
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
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu(menuOpen === photo.id ? null : photo.id);
            }}
            className={cn(
              "absolute top-1 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity",
              photo.is_private ? "right-8" : "right-1"
            )}
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {/* Dropdown menu */}
          {menuOpen === photo.id && (
            <div
              className="absolute top-8 right-1 bg-background rounded-md shadow-neu-floating border-0 py-1 min-w-[140px] z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {!photo.is_avatar && photo.approval_status === "approved" && (
                <button
                  onClick={() => onSetAvatar(photo.id)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                >
                  <Star className="h-4 w-4" />
                  Set as Avatar
                </button>
              )}
              {photo.approval_status === "approved" && (
                <button
                  onClick={() => onTogglePrivate(photo.id, photo.is_private)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                >
                  {photo.is_private ? (
                    <>
                      <Unlock className="h-4 w-4" />
                      Make Public
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Make Private
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => onDelete(photo.id)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent text-destructive flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
