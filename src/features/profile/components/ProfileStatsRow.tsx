"use client";

import type { ProfileStats } from "@/types/database";

interface StatCardProps {
  value: number | string;
  label: string;
}

function StatCard({ value, label }: StatCardProps) {
  return (
    <div className="card flex-1 flex flex-col items-center py-3 px-2 gap-0.5">
      <span className="t-title-2 tabular text-ink-9">{value}</span>
      <span className="t-caption muted">{label}</span>
    </div>
  );
}

interface ProfileStatsRowProps {
  stats: ProfileStats;
  showMeetings?: boolean;
  showRadius?: boolean;
  className?: string;
}

export function ProfileStatsRow({ stats, showMeetings = false, showRadius = false, className }: ProfileStatsRowProps) {
  return (
    <div className={`flex gap-3 ${className ?? ""}`}>
      <StatCard value={stats.friends_count} label="Friends" />
      {showMeetings && <StatCard value={stats.meetings_count ?? 0} label="Meetings" />}
      <StatCard value={stats.photos_count} label="Photos" />
      {showRadius && <StatCard value={stats.radius_km != null ? `${stats.radius_km} km` : "–"} label="Radius" />}
    </div>
  );
}
