export type OwnerProfileUpdateAttempt = Readonly<{
  ownerId: string;
  generation: number;
  signal: AbortSignal;
}>;

/** Fences profile writes so cancelled or previous-account callbacks cannot commit. */
export function createOwnerProfileUpdateCoordinator() {
  let generation = 0;
  let active: {
    ownerId: string;
    generation: number;
    controller: AbortController;
  } | null = null;

  const isCurrent = (attempt: OwnerProfileUpdateAttempt, currentOwnerId: string) =>
    active !== null
    && active.ownerId === currentOwnerId
    && active.ownerId === attempt.ownerId
    && active.generation === attempt.generation
    && active.controller.signal === attempt.signal
    && !attempt.signal.aborted;

  return {
    begin(ownerId: string): OwnerProfileUpdateAttempt {
      active?.controller.abort();
      generation += 1;
      const controller = new AbortController();
      active = { ownerId, generation, controller };
      return { ownerId, generation, signal: controller.signal };
    },
    isCurrent,
    finish(attempt: OwnerProfileUpdateAttempt, currentOwnerId: string) {
      if (!isCurrent(attempt, currentOwnerId)) return false;
      active = null;
      return true;
    },
    cancel() {
      active?.controller.abort();
      active = null;
    },
  };
}
