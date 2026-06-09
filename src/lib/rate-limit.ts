import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { RATE_LIMITS } from "@/lib/constants";

type RateLimitName = keyof typeof RATE_LIMITS;

let redis: Redis | null | undefined; // undefined = not yet initialised
const limiters = new Map<RateLimitName, Ratelimit>();

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  // Accept both UPSTASH_* (direct) and KV_* (Vercel Marketplace integration) naming
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    redis = null; // env vars absent — dev / CI without Redis
    return null;
  }
  try {
    redis = new Redis({ url, token });
  } catch (err) {
    console.error("rate-limit: failed to init Redis client:", err);
    redis = null;
  }
  return redis;
}

function getLimiter(name: RateLimitName): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!limiters.has(name)) {
    const { limit, window } = RATE_LIMITS[name];
    limiters.set(
      name,
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(limit, `${window} s`),
        prefix: `ratelimit:${name}`,
      })
    );
  }
  return limiters.get(name)!;
}

/**
 * Checks the rate limit for the given endpoint and identifier (typically user.id).
 *
 * Mirrors the requireAdminRole early-return pattern:
 *   - Returns null → caller should proceed.
 *   - Returns NextResponse (429) → caller should return it immediately.
 *
 * Fail-open: if Redis is unavailable or `.limit()` throws, logs once and returns null
 * so the app never goes down because of the rate limiter.
 * Side-effect: inert when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are
 * absent (dev, CI, tests) — no mocking needed.
 */
export async function enforceRateLimit(
  name: RateLimitName,
  identifier: string
): Promise<NextResponse | null> {
  const limiter = getLimiter(name);
  if (!limiter) return null;

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);
    if (!success) {
      const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      const response = apiError("Too many requests", 429, "RATE_LIMITED");
      response.headers.set("Retry-After", String(retryAfterSec));
      response.headers.set("X-RateLimit-Limit", String(limit));
      response.headers.set("X-RateLimit-Remaining", "0");
      return response;
    }
  } catch (err) {
    console.error("enforceRateLimit: Redis error (fail-open):", err);
  }

  return null;
}
