"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const serverTimeZone = () => "UTC";
const viewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Stable server markup followed by the viewer's explicitly labelled local time. */
export function LocalDateTime({ value }: { value: string }) {
  const timeZone = useSyncExternalStore(subscribe, viewerTimeZone, serverTimeZone);
  return <time dateTime={value}>{new Intl.DateTimeFormat("en", {
    weekday: "long", month: "short", day: "numeric", hour: "numeric",
    minute: "2-digit", timeZoneName: "short", timeZone,
  }).format(new Date(value))}</time>;
}
