"use client";

import { ScanQrCode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { joinSharedGroup } from "@/data/shared-groups";
import { webQueryKeys } from "@/data/web-query";
import { QrScannerDialog } from "./QrScannerDialog";
import { useCallback, useRef, useState } from "react";

export function QrScanButton() {
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
        aria-label="Scan a QR code to join a shared group"
        className="map-qr-scan iconbtn absolute right-4 z-40 pointer-events-auto"
        style={{
          top: "calc(var(--safe-area-top) + 112px)",
          width: 44,
          height: 44,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
        onClick={openScanner}
      >
        <ScanQrCode aria-hidden="true" size={20} strokeWidth={2} />
      </button>
      {open ? <QrScannerDialog open onClose={closeScanner} onDecoded={handleDecoded} /> : null}
    </>
  );
}
