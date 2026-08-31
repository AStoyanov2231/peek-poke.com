"use client";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname.startsWith("/chat");
  const isRoom = pathname.startsWith("/room/");
  const isMap = pathname === "/";
  return (
    <div className={cn("flex-1 min-w-0 overflow-y-auto flex flex-col relative z-[1]", (isChat || isRoom) && "overflow-hidden", isMap && "pointer-events-none")}>
      {children}
    </div>
  );
}
