import type { AuthProfileEnsureResponse } from "@peekpoke/shared";

type BootstrapIdentity = { identity: { id: string } };
type ProfileBootstrapDependencies<T extends BootstrapIdentity> = {
  currentSessionUserId: () => Promise<string | null>;
  ensureProfile: (signal?: AbortSignal) => Promise<AuthProfileEnsureResponse>;
  fetchBootstrap: (signal?: AbortSignal) => Promise<T>;
};

export async function loadBootstrapForCurrentSession<T extends BootstrapIdentity>(
  expectedUserId: string,
  dependencies: ProfileBootstrapDependencies<T>,
  signal?: AbortSignal,
): Promise<T | null> {
  if (signal?.aborted) throw signal.reason;
  if (await dependencies.currentSessionUserId() !== expectedUserId) return null;

  const ensured = await dependencies.ensureProfile(signal);
  if (signal?.aborted) throw signal.reason;
  if (ensured.profile.id !== expectedUserId) return null;
  if (await dependencies.currentSessionUserId() !== expectedUserId) return null;

  const bootstrap = await dependencies.fetchBootstrap(signal);
  if (signal?.aborted) throw signal.reason;
  if (bootstrap.identity.id !== expectedUserId) return null;
  if (await dependencies.currentSessionUserId() !== expectedUserId) return null;

  return bootstrap;
}
