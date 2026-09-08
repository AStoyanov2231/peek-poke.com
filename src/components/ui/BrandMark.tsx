import { cn } from "@/lib/utils";
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={cn("h-9 w-9 shrink-0 text-primary", className)}
      fill="none"
    >
      <path
        d="M18 9a11 11 0 1 0 0 22"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M22 9a11 11 0 1 1 0 22"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="20" cy="20" r="3" fill="currentColor" />
    </svg>
  );
}
