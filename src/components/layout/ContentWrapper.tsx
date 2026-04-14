"use client";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showDesktopNav = !pathname.startsWith("/chat") && pathname !== "/onboarding";
  const isMapPage = pathname === "/";
  return (
    <div
      className={cn("flex-1 overflow-y-auto", showDesktopNav && !isMapPage && "md:pl-16")}
    >
      {children}
    </div>
  );
}
