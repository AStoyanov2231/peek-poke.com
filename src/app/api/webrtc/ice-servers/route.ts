import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

const DEFAULT_STUN_URL = "stun:stun.l.google.com:19302";
const TURN_CREDENTIAL_TTL_SECONDS = 60 * 60;

function urls(value: string | undefined, fallback?: string) {
  const parsed = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed?.length ? parsed : fallback ? [fallback] : [];
}

export const GET = withAuth(async (_request, { user }) => {
  const limited = await enforceRateLimit("callCredentials", user.id);
  if (limited) return limited;

  const iceServers: RTCIceServer[] = [
    { urls: urls(process.env.STUN_URLS, DEFAULT_STUN_URL) },
  ];
  const turnUrls = urls(process.env.TURN_URLS);
  const sharedSecret = process.env.TURN_SHARED_SECRET;

  if (turnUrls.length && sharedSecret) {
    const expires = Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
    const username = `${expires}:${user.id}`;
    const credential = createHmac("sha1", sharedSecret)
      .update(username)
      .digest("base64");
    iceServers.push({ urls: turnUrls, username, credential });
  }

  return NextResponse.json(
    { iceServers },
    { headers: { "Cache-Control": "private, no-store" } }
  );
});
