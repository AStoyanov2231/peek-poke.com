export function hasPlanStarted(startsAt: string, now: number) {
  return new Date(startsAt).getTime() <= now;
}
