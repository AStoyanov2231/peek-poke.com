import Link from "next/link";
import { Sparkles } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-4">
      <div className="w-16 h-16 rounded-full bg-ink-1 flex items-center justify-center">
        <Sparkles className="w-8 h-8" style={{ color: "var(--ink-5)" }} strokeWidth={1.5} />
      </div>
      <div className="space-y-1">
        <p className="t-title-2 text-ink-9">Pick a chat to start</p>
      </div>
      <Link href="/" className="btn btn-accent btn-md">
        Find someone nearby
      </Link>
    </div>
  );
}
