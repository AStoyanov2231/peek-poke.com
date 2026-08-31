"use client";

import { ChevronLeft, Users } from "lucide-react";
import type { RoomSummary } from "@peekpoke/shared";

export function RoomHeader({ room, onBack }: { room: RoomSummary; onBack: () => void }) {
  return (
    <header
      className="flex flex-shrink-0 items-center gap-3 border-b border-hairline bg-surface px-4"
      style={{ paddingTop: "calc(var(--safe-area-top) + 12px)", paddingBottom: 12 }}
    >
      <button type="button" onClick={onBack} className="iconbtn" style={{ width: 36, height: 36 }} aria-label="Back to rooms">
        <ChevronLeft size={22} />
      </button>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary">
        <Users size={19} />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="t-body-b truncate text-ink-9">{room.name}</h1>
        <p className="t-caption muted">{room.member_count} {room.member_count === 1 ? "member" : "members"}</p>
      </div>
    </header>
  );
}
