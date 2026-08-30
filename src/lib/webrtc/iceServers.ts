/**
 * Fetches authenticated, short-lived TURN credentials from the server. Static
 * TURN secrets must never be embedded in a browser or native bundle.
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const response = await fetch("/api/webrtc/ice-servers", { cache: "no-store" });
    if (!response.ok) throw new Error("ICE server request failed");
    const payload = (await response.json()) as { iceServers?: RTCIceServer[] };
    if (payload.iceServers?.length) return payload.iceServers;
  } catch (error) {
    console.warn("Falling back to STUN-only calling:", error);
  }
  return [{ urls: ["stun:stun.l.google.com:19302"] }];
}
