"use client";

import { useEffect } from "react";

export function DisableZoom() {
  useEffect(() => {
    // Block trackpad pinch-to-zoom (reported as wheel + ctrlKey/metaKey)
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    // Block Ctrl/Cmd +/- keyboard zoom
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "-" || e.key === "=")) {
        e.preventDefault();
      }
    };

    // Must use passive: false to allow preventDefault on wheel
    document.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("keydown", handleKeydown);

    return () => {
      document.removeEventListener("wheel", handleWheel);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  return null;
}
