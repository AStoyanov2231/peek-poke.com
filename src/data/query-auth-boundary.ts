export function shouldClearQueryCacheForAuthChange(
  previousOwnerId: string | null | undefined,
  nextOwnerId: string | null,
) {
  return previousOwnerId !== undefined && previousOwnerId !== nextOwnerId;
}
