"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native";

const ALLOWED_ROUTES = ["/", "/inbox", "/profile"];

export function NativeBridgeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!isNativeApp()) return;

    window.navigateFromNative = (route: string) => {
      if (ALLOWED_ROUTES.includes(route)) {
        window.location.href = route;
      }
    };

    return () => {
      delete window.navigateFromNative;
    };
  }, []);

  return <>{children}</>;
}
