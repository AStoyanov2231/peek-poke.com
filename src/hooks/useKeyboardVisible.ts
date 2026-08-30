import { useState, useEffect } from "react";

/**
 * Detects if the virtual keyboard is visible on mobile devices
 * using the visualViewport API.
 */
export function useKeyboardVisible(): boolean {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const initialHeight = visualViewport.height;
    const KEYBOARD_THRESHOLD = 150;

    const handleResize = () => {
      const heightDiff = initialHeight - visualViewport.height;
      setIsKeyboardVisible(heightDiff > KEYBOARD_THRESHOLD);
    };

    visualViewport.addEventListener("resize", handleResize);

    return () => {
      visualViewport.removeEventListener("resize", handleResize);
    };
  }, []);

  return isKeyboardVisible;
}
