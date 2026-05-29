"use client";
/**
 * CallProvider — renders global call overlays (IncomingCallOverlay, CallView).
 *
 * Mounted once in (main)/layout.tsx as a fixed-position overlay host.
 * Reads call state from callStore and renders the appropriate UI.
 * Returns null when no call or invite is active.
 */

import { useCallStore } from "@/stores/callStore";
import { CallView } from "@/components/call/CallView";
import { IncomingCallOverlay } from "@/components/call/IncomingCallOverlay";

export function CallProvider() {
  const activeCall = useCallStore((s) => s.activeCall);
  const incomingInvite = useCallStore((s) => s.incomingInvite);

  return (
    <>
      {/* Ring overlay — shown when a call invite arrives and we're not in a call */}
      {incomingInvite && !activeCall && (
        <IncomingCallOverlay invite={incomingInvite} />
      )}

      {/* Full call view — shown while a call is active (outgoing or incoming) */}
      {activeCall && <CallView call={activeCall} />}
    </>
  );
}
