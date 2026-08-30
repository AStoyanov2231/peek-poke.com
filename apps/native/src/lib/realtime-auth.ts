export type RealtimeAuthSession = {
  user: { id: string };
  access_token: string;
};

type RealtimeAuthTarget = {
  key: string;
  token: string | undefined;
};

const ANONYMOUS_KEY = "anonymous";

/** Serializes Realtime JWT updates so a late old-session update cannot win. */
export function createRealtimeAuthSynchronizer(
  applyToken: (token?: string) => Promise<unknown>,
) {
  let desired: RealtimeAuthTarget | null = null;
  let appliedKey: string | null = null;
  let running: Promise<void> | null = null;

  const drain = async () => {
    while (desired && desired.key !== appliedKey) {
      const next = desired;
      try {
        await applyToken(next.token);
      } catch (error) {
        if (desired.key !== next.key) continue;
        throw error;
      }
      appliedKey = next.key;
    }
  };

  const sync = (next: RealtimeAuthTarget) => {
    desired = next;
    if (desired.key === appliedKey) return running ?? Promise.resolve();
    if (!running) {
      running = drain().finally(() => {
        running = null;
      });
    }
    return running;
  };

  return {
    session(session: RealtimeAuthSession) {
      return sync({
        key: `${session.user.id}:${session.access_token}`,
        token: session.access_token,
      });
    },
    anonymous() {
      return sync({ key: ANONYMOUS_KEY, token: undefined });
    },
  };
}
