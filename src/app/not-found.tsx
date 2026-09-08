import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
export default function NotFound() {
  return (
    <main
      id="main-content"
      className="flex h-dvh flex-col items-center justify-center gap-5 overflow-auto bg-background p-7 text-center"
    >
      <BrandMark className="h-14 w-14" />
      <p className="eyebrow mb-0 text-ink-6">A small detour</p>
      <h1 className="text-4xl font-semibold tracking-[-.05em]">
        This spot isn’t on the map.
      </h1>
      <p className="max-w-sm text-sm leading-relaxed text-ink-6">
        The link may have changed or the page is no longer here. There’s still
        plenty to explore.
      </p>
      <Link href="/" className="btn btn-accent btn-lg mt-3">
        Back to Peek <ArrowRight size={18} />
      </Link>
    </main>
  );
}
