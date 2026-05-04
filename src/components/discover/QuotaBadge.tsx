"use client";

interface QuotaBadgeProps {
  remaining: number | null;
}

export function QuotaBadge({ remaining }: QuotaBadgeProps) {
  return (
    <div
      className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
      style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)", color: "var(--ink-9)" }}
    >
      <span style={{ color: "var(--primary-500)" }}>♥</span>
      {remaining === null ? "∞" : `${remaining}`}
      <span className="text-ink-5 font-normal">pokes left</span>
    </div>
  );
}
