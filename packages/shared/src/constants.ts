export const APP_NAME = "Peek & Poke";
export const DEFAULT_NEARBY_RADIUS_KM = 2;
// Nearby coordinates are quantized to 0.001 degrees. This conservative client
// prefilter includes the 50 m server meeting radius plus worst-case rounding
// error; the server remains authoritative before recording a meeting.
export const MEETING_CANDIDATE_RADIUS_KM = 0.13;
export function meetingProximityEligible(distanceMeters: number | null | undefined) {
  return distanceMeters !== null
    && distanceMeters !== undefined
    && Number.isFinite(distanceMeters)
    && distanceMeters >= 0
    && distanceMeters <= MEETING_CANDIDATE_RADIUS_KM * 1_000;
}
export const BOT_COLLECT_RANGE_KM = 0.05;
export const LOCATION_SERVER_FRESHNESS_WINDOW_MS = 10 * 60_000;
// Clients stop trusting an acknowledgement before the database's 10-minute
// freshness window, leaving room for request latency and clock skew.
export const LOCATION_ACK_FRESHNESS_TTL_MS = 8 * 60_000;
export const LOCATION_ACK_TIMER_MAX_RECHECK_MS = 30_000;

export function locationAcknowledgementIsFresh(
  acknowledgedAt: number | null | undefined,
  now = Date.now(),
) {
  if (acknowledgedAt === null || acknowledgedAt === undefined) return false;
  const age = now - acknowledgedAt;
  return age >= 0 && age < LOCATION_ACK_FRESHNESS_TTL_MS;
}

export function locationAcknowledgementTimerDelay({
  acknowledgedAt,
  canRecheck,
  monotonicDeadline,
  monotonicNow,
  now,
}: {
  acknowledgedAt: number | null | undefined;
  canRecheck: boolean;
  monotonicDeadline: number;
  monotonicNow: number;
  now: number;
}) {
  if (!locationAcknowledgementIsFresh(acknowledgedAt, now)) return null;
  const monotonicRemaining = monotonicDeadline - monotonicNow;
  if (!canRecheck || monotonicRemaining <= 0 || acknowledgedAt == null) return null;
  const wallRemaining = acknowledgedAt + LOCATION_ACK_FRESHNESS_TTL_MS - now;
  return Math.max(
    1,
    Math.ceil(Math.min(
      LOCATION_ACK_TIMER_MAX_RECHECK_MS,
      monotonicRemaining,
      wallRemaining,
    )),
  );
}
export const MAX_PROFILE_PHOTOS = 12;
export const MAX_DISPLAY_NAME_LENGTH = 50;
export const MAX_BIO_LENGTH = 500;
export const EDIT_WINDOW_MINUTES = 15;
export const PREMIUM_ENTITLEMENT_ID = "premium";
