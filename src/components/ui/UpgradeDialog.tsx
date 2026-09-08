"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message?: string;
}

export function UpgradeDialog({ open, onOpenChange, message }: UpgradeDialogProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: "var(--primary-500)" }} />
            Peek+ is coming soon
          </DialogTitle>
          <DialogDescription>
            {message ?? "We are still building optional extras. New subscriptions are not available yet."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="accent"
            onClick={() => {
              onOpenChange(false);
              router.push("/premium");
            }}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            See Peek+
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
