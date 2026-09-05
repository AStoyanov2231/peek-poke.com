"use client";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname.startsWith("/chat") || pathname.startsWith("/group");
  const isMap = pathname === "/";
  return (
    <div className={cn("flex-1 min-w-0 overflow-y-auto flex flex-col relative z-[1]", isChat && "overflow-hidden", isMap && "pointer-events-none")}>
      {children}
    </div>
  );
}
