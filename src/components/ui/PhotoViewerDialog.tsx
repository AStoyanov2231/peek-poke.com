"use client";

import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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
  const touchStartX = useRef<number | null>(null);

  const prev = useCallback(() => onIndexChange((currentIndex - 1 + photos.length) % photos.length), [currentIndex, onIndexChange, photos.length]);
  const next = useCallback(() => onIndexChange((currentIndex + 1) % photos.length), [currentIndex, onIndexChange, photos.length]);
  const handleKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
  });

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 50) delta > 0 ? next() : prev();
    touchStartX.current = null;
  };

  const current = photos[currentIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-none !w-screen !h-screen !rounded-none !p-0 bg-black border-0 flex flex-col">
        <DialogTitle className="sr-only">Photo viewer</DialogTitle>

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
          <span className="text-white/60 text-sm tabular-nums">
            {currentIndex + 1} / {photos.length}
          </span>
          <button type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close photo viewer"
            className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main image */}
        <div
          className="flex-1 flex items-center justify-center relative overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {current && (
            // The animation utility only applies opacity to this image.
            // react-doctor-disable-next-line no-transition-all
            <Image
              key={current.url}
              src={current.url}
              alt=""
              fill
              sizes="100vw"
              className="max-w-full max-h-full object-contain animate-in fade-in duration-200"
            />
          )}

          {photos.length > 1 && (
            <>
              <button type="button"
                onClick={prev}
                aria-label="Previous photo"
                className="absolute left-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button type="button"
                onClick={next}
                aria-label="Next photo"
                className="absolute right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>

        {/* Filmstrip */}
        {photos.length > 1 && (
          <div className="flex-shrink-0 px-4 py-3">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide justify-center">
              {photos.map((photo, i) => (
                <button type="button"
                  key={photo.id ?? i}
                  onClick={() => onIndexChange(i)}
                  className={`relative flex-shrink-0 w-12 h-12 rounded overflow-hidden transition-all ${
                    i === currentIndex
                      ? "ring-2 ring-white opacity-100"
                      : "opacity-40 hover:opacity-70"
                  }`}
                >
                  <Image src={photo.url} alt="" fill sizes="48px" className="object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
