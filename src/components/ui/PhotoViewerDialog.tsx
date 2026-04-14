"use client";

import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface PhotoViewerDialogProps {
  photos: Array<{ url: string; id?: string }>;
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}

export function PhotoViewerDialog({
  photos,
  currentIndex,
  open,
  onOpenChange,
  onIndexChange,
}: PhotoViewerDialogProps) {
  const prevPhoto = () => {
    onIndexChange((currentIndex - 1 + photos.length) % photos.length);
  };

  const nextPhoto = () => {
    onIndexChange((currentIndex + 1) % photos.length);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 bg-black/95 border-none">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {photos.length > 1 && (
          <>
            <button
              onClick={prevPhoto}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={nextPhoto}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}

        <div className="flex items-center justify-center min-h-[60vh] p-4">
          {photos[currentIndex] && (
            <img
              src={photos[currentIndex].url}
              alt=""
              className="max-w-full max-h-[80vh] object-contain"
            />
          )}
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm">
          {currentIndex + 1} / {photos.length}
        </div>
      </DialogContent>
    </Dialog>
  );
}
