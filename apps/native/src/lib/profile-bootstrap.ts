import type { AuthProfileEnsureResponse, Bootstrap } from "@peekpoke/shared";

type ProfileBootstrapDependencies = {
  currentSessionUserId: () => Promise<string | null>;
  ensureProfile: (signal?: AbortSignal) => Promise<AuthProfileEnsureResponse>;
  fetchBootstrap: (signal?: AbortSignal) => Promise<Bootstrap>;
};

export async function loadBootstrapForCurrentSession(
  expectedUserId: string,
  dependencies: ProfileBootstrapDependencies,
  signal?: AbortSignal,
): Promise<Bootstrap | null> {
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
