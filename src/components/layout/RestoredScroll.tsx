"use client";

import { useLayoutEffect, useRef } from "react";

// Module scope: positions survive section unmounts for the lifetime of the app
// session (sections remount on native tab switches but render instantly from the
// warm React Query/Zustand caches — this puts the scroll back where it was).
const scrollPositions = new Map<string, number>();

/** Test-only escape hatch. */
export function __clearScrollPositions() {
  scrollPositions.clear();
}

/**
 * Scroll container that restores its position when remounted under the same key.
 * Use one stable key per logical section (e.g. "profile", "inbox:chats").
 */
export function RestoredScroll({
  storageKey,
  className,
  children,
}: {
  storageKey: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = scrollPositions.get(storageKey);
    if (saved) el.scrollTop = saved;
    const onScroll = () => scrollPositions.set(storageKey, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [storageKey]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
