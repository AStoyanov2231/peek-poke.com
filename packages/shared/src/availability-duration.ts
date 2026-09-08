/** Convert a local UI deadline to the bounded duration accepted by the server. */
export function availabilityDurationForEnd(
  end: Date | string,
  now = new Date(),
): number | null {
  const endTime = end instanceof Date ? end.getTime() : Date.parse(end);
  const duration = Math.ceil((endTime - now.getTime()) / 60_000);
  return Number.isFinite(duration) && duration >= 15 && duration <= 720
    ? duration
    : null;
}
