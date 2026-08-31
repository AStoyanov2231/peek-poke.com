"use client";

import { useEffect, useState } from "react";

/**
 * Transient "Get closer" pill for native bot taps that are out of collection
 * range. Web BotPin renders its own inline hint; native pins are Mapbox
 * annotations, so NativeMapBridge dispatches `peekpoke:bot-hint` instead.
 */
export function BotHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let tid: ReturnType<typeof setTimeout> | undefined;
    const handler = () => {
      setVisible(true);
      clearTimeout(tid);
      tid = setTimeout(() => setVisible(false), 2000);
    };
    window.addEventListener("peekpoke:bot-hint", handler);
    return () => {
      window.removeEventListener("peekpoke:bot-hint", handler);
      clearTimeout(tid);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 bottom-44 z-50 pointer-events-none rounded-full px-3.5 py-1.5 text-xs font-medium text-white shadow-e-2"
      style={{ background: "var(--ink-9)" }}
    >
      Get closer
    </div>
  );
}
