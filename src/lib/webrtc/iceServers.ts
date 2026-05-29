/**
 * Returns RTCIceServer config from environment variables.
 *
 * Ships with free Google STUN by default.
 * Set TURN env vars to enable relay (needed for strict NAT / cellular networks).
 *
 * Env vars (all optional):
 *   NEXT_PUBLIC_STUN_URLS       Comma-separated STUN URLs (default: stun.l.google.com:19302)
 *   NEXT_PUBLIC_TURN_URL        TURN server URL
 *   NEXT_PUBLIC_TURN_USERNAME   TURN username
 *   NEXT_PUBLIC_TURN_CREDENTIAL TURN credential
 */
export function getIceServers(): RTCIceServer[] {
  const stunUrls = process.env.NEXT_PUBLIC_STUN_URLS
    ? process.env.NEXT_PUBLIC_STUN_URLS.split(",").map((s) => s.trim())
    : ["stun:stun.l.google.com:19302"];

  const servers: RTCIceServer[] = [{ urls: stunUrls }];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return servers;
}
