type SessionRecoveryDependencies = {
  deactivateAuthenticatedUi: () => void;
  clearServerState: () => void;
  resetAppState: () => void;
  resetCallState: () => void;
  unregisterPush: () => Promise<unknown>;
  stopAuthRefresh: () => Promise<unknown>;
  signOutLocally: () => Promise<{ error: unknown | null }>;
  clearPersistedSession: () => Promise<unknown>;
  clearRealtimeSession: () => Promise<unknown>;
  replaceWithLogin: () => void;
  reportError?: (label: string, error: unknown) => void;
};

type SessionRecoveryAttempt = {
  unregisterPush?: () => Promise<unknown>;
};

export function createUnauthorizedSessionRecovery(dependencies: SessionRecoveryDependencies) {
  let recoveryPromise: Promise<void> | null = null;

  return function recoverUnauthorizedSession(attempt: SessionRecoveryAttempt = {}) {
    if (recoveryPromise) return recoveryPromise;

    const unregisterPush = attempt.unregisterPush ?? dependencies.unregisterPush;

    recoveryPromise = (async () => {
      for (const [label, cleanup] of [
        ["authenticated UI deactivation", dependencies.deactivateAuthenticatedUi],
        ["server state cleanup", dependencies.clearServerState],
        ["app state cleanup", dependencies.resetAppState],
        ["call state cleanup", dependencies.resetCallState],
      ] as const) {
        try {
          cleanup();
        } catch (error) {
          dependencies.reportError?.(label, error);
        }
      }

      try {
        await dependencies.stopAuthRefresh();
      } catch (error) {
        dependencies.reportError?.("auth refresh cleanup", error);
      }

      try {
        await unregisterPush();
      } catch (error) {
        dependencies.reportError?.("push cleanup", error);
      }

      try {
        const { error } = await dependencies.signOutLocally();
        if (error) dependencies.reportError?.("local sign out", error);
      } catch (error) {
        dependencies.reportError?.("local sign out", error);
      }

      try {
        await dependencies.clearPersistedSession();
      } catch (error) {
        dependencies.reportError?.("persisted session cleanup", error);
      }

      try {
        await dependencies.clearRealtimeSession();
      } catch (error) {
        dependencies.reportError?.("realtime cleanup", error);
      } finally {
        dependencies.replaceWithLogin();
      }
    })().finally(() => {
      recoveryPromise = null;
    });

    return recoveryPromise;
  };
}
