import { env } from "@/lib/env";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

function allowedOrigins() {
  const origins = new Set<string>();
  try {
    origins.add(new URL(env.apiBaseUrl).origin);
  } catch {
    /* configuration validation happens elsewhere */
  }
  origins.add("https://www.peek-poke.com");
  origins.add("https://peek-poke.com");
  return origins;
}

export function planShareTokenFromQrContent(content: string): string | null {
  try {
    const url = new URL(content);
    if (
      url.protocol !== "https:" ||
      !allowedOrigins().has(url.origin) ||
      url.search ||
      url.hash
    )
      return null;
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.length === 2 &&
      segments[0] === "plan" &&
      tokenPattern.test(segments[1])
      ? segments[1]
      : null;
  } catch {
    return null;
  }
}
