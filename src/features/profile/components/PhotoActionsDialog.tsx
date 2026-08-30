"use client";

import { Lock, Star, Trash2, Unlock } from "lucide-react";
import type { ReactNode } from "react";
import type { OwnerProfilePhoto } from "@peekpoke/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PhotoActionsDialogProps {
  photo: OwnerProfilePhoto | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (photoId: string) => void;
  onSetAvatar: (photoId: string) => void;
  onTogglePrivate: (photoId: string, currentPrivate: boolean) => void;
}

export function PhotoActionsDialog({
  photo,
  onOpenChange,
  onDelete,
  onSetAvatar,
  onTogglePrivate,
}: PhotoActionsDialogProps) {
  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <Dialog open={photo !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage photo</DialogTitle>
          <DialogDescription>Choose an action for this photo.</DialogDescription>
        </DialogHeader>
        {photo ? (
          <div className="flex flex-col gap-1">
            {!photo.is_avatar && photo.approval_status === "approved" ? (
              <PhotoAction
                icon={<Star aria-hidden className="h-4 w-4" />}
                label="Set as Avatar"
                onClick={() => run(() => onSetAvatar(photo.id))}
              />
            ) : null}
            {photo.approval_status === "approved" ? (
              <PhotoAction
                icon={photo.is_private ? <Unlock aria-hidden className="h-4 w-4" /> : <Lock aria-hidden className="h-4 w-4" />}
                label={photo.is_private ? "Make Public" : "Make Private"}
                onClick={() => run(() => onTogglePrivate(photo.id, photo.is_private))}
              />
            ) : null}
            <PhotoAction
              danger
              icon={<Trash2 aria-hidden className="h-4 w-4" />}
              label="Delete"
              onClick={() => run(() => onDelete(photo.id))}
            />
          </div>
        ) : null}
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
      </DialogContent>
    </Dialog>
  );
}

function PhotoAction({
  danger = false,
  icon,
  label,
  onClick,
}: {
  danger?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex h-11 w-full items-center gap-2 rounded-sm px-3 text-left text-sm font-medium transition-colors hover:bg-ink-1 ${danger ? "text-danger-500" : "text-ink-9"}`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
