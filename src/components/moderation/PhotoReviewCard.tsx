"use client";

import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ProfilePhoto, Profile, PhotoApprovalStatus } from "@/types/database";

type PhotoWithUser = ProfilePhoto & {
  user: Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;
  reviewer?: Pick<Profile, "id" | "username" | "display_name"> | null;
};

interface PhotoReviewCardProps {
  photo: PhotoWithUser;
  index: number;
  status: PhotoApprovalStatus;
  isActionLoading: boolean;
  onOpenViewer: (index: number) => void;
  onApprove: (photoId: string) => void;
  onOpenRejectDialog: (photoId: string) => void;
}

export function PhotoReviewCard({
  photo,
  index,
  status,
  isActionLoading,
  onOpenViewer,
  onApprove,
  onOpenRejectDialog,
}: PhotoReviewCardProps) {
  return (
    <div className="relative group rounded-lg overflow-hidden bg-muted aspect-square">
      <img
        src={photo.thumbnail_url || photo.url}
        alt=""
        className="w-full h-full object-cover cursor-pointer"
        onClick={() => onOpenViewer(index)}
      />

      {/* User info overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={photo.user.avatar_url || undefined} />
            <AvatarFallback className="text-xs">
              {photo.user.username?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-white truncate">
            {photo.user.display_name || photo.user.username}
          </span>
        </div>
      </div>

      {/* Action buttons for pending */}
      {status === "pending" && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-green-500 hover:bg-green-600 text-white"
            onClick={() => onApprove(photo.id)}
            disabled={isActionLoading}
          >
            {isActionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-red-500 hover:bg-red-600 text-white"
            onClick={() => onOpenRejectDialog(photo.id)}
            disabled={isActionLoading}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Rejection reason for rejected photos */}
      {status === "rejected" && photo.rejection_reason && (
        <div className="absolute top-2 left-2 right-2">
          <Badge variant="destructive" className="text-xs truncate max-w-full">
            {photo.rejection_reason}
          </Badge>
        </div>
      )}
    </div>
  );
}
