export type PlanMeetupConfirmationAttempt = {
  accountId: string;
  peerId: string;
};

function attemptId(attempt: PlanMeetupConfirmationAttempt) {
  return `${attempt.accountId}:${attempt.peerId}`;
}

export function createPlanMeetupAttemptRegistry(
  createKey: () => string = () => crypto.randomUUID(),
) {
  const attempts = new Map<string, string>();

  return {
    keyFor(attempt: PlanMeetupConfirmationAttempt) {
      const existing = attempts.get(attemptId(attempt));
      if (existing) return existing;

      const created = createKey();
      attempts.set(attemptId(attempt), created);
      return created;
    },
  };
}
