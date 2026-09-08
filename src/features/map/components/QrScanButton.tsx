"use client";

import { ScanQrCode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { joinSharedGroup } from "@/data/shared-groups";
import { webQueryKeys } from "@/data/web-query";
import { QrScannerDialog } from "./QrScannerDialog";
import { useCallback, useRef, useState } from "react";
import { inviteTokenSchema, isAllowedInviteOrigin } from "@peekpoke/shared";

export function QrScanButton({ variant = "map" }: { variant?: "map" | "inline" }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const scannerSessionRef = useRef(0);
  const openScanner = useCallback(() => {
    scannerSessionRef.current += 1;
    setOpen(true);
  }, []);
  const closeScanner = useCallback(() => {
    scannerSessionRef.current += 1;
    setOpen(false);
  }, []);

  const handleDecoded = useCallback(async (content: string) => {
    const session = scannerSessionRef.current;
    // Peek links open a preview. Arbitrary QR text keeps its existing Circle semantics.
    try {
      const url = new URL(content);
      const trustedOrigins = new Set([window.location.origin, "https://www.peek-poke.com", "https://peek-poke.com"]);
      const trusted = trustedOrigins.has(url.origin) && isAllowedInviteOrigin(url.origin, process.env.NODE_ENV === "development");
      if (trusted && /^\/plan\/[a-zA-Z0-9_-]{43}$/.test(url.pathname)) {
        closeScanner();
        router.push(url.pathname);
        return;
      }
      const inviteMatch = /^\/invite\/([^/]+)$/.exec(url.pathname);
      if (trusted && inviteMatch && inviteTokenSchema.safeParse(inviteMatch[1]).success) {
        closeScanner();
        router.push(`/invite/${encodeURIComponent(inviteMatch[1])}`);
        return;
      }
    } catch { /* Non-URL QR payloads are valid Circle identities. */ }
    const response = await joinSharedGroup(content);
    await queryClient.invalidateQueries({ queryKey: webQueryKeys.groups });
    if (session !== scannerSessionRef.current) return;
    closeScanner();
    router.push(window.innerWidth < 768
      ? `/group/${encodeURIComponent(response.group.id)}`
      : `/inbox?tab=chats&group=${encodeURIComponent(response.group.id)}`);
  }, [closeScanner, queryClient, router]);

  return (
    <>
      <style>{`@media(min-width:768px){.map-qr-scan{top:16px!important}}`}</style>
      <button
        type="button"
        aria-label="Scan to join a Plan or Circle"
        className={variant === "inline" ? "btn btn-secondary btn-sm gap-2" : "map-qr-scan iconbtn absolute right-4 z-40 pointer-events-auto"}
        style={variant === "inline" ? undefined : {
          top: "calc(var(--safe-area-top) + 160px)",
          width: 44,
          height: 44,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
        onClick={openScanner}
      >
        <ScanQrCode aria-hidden="true" size={20} strokeWidth={2} />
        {variant === "inline" && "Scan"}
      </button>
      {open ? <QrScannerDialog open onClose={closeScanner} onDecoded={handleDecoded} /> : null}
    </>
  );
}
