"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface InsufficientCoinsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InsufficientCoinsDialog({ open, onOpenChange }: InsufficientCoinsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-amber-500">
              <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <text x="12" y="16" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="bold">C</text>
            </svg>
            No Coins Left
          </DialogTitle>
          <DialogDescription>
            You&apos;ve used all your friend request coins! Meet your existing friends in real life (within 50m) to earn more coins. Each meetup earns +1 coin for both of you.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
