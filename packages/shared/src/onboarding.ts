export const onboardingRecoveryPolicy = Object.freeze({
  initial: Object.freeze({
    message: "Onboarding couldn't be loaded.",
    action: "Try again",
  }),
  interests: Object.freeze({
    message: "Interests couldn't be loaded.",
    action: "Try again",
  }),
});

type OnboardingRecoveryScope = keyof typeof onboardingRecoveryPolicy;

export type OnboardingLoadState =
  | { kind: "loading" }
  | { kind: "ready" }
  | {
      kind: "error";
      message: string;
      action: { label: string; run: () => Promise<void> };
    };

export function onboardingLoadState(input: {
  pending: boolean;
  failed: boolean;
  scope: OnboardingRecoveryScope;
  reload: ReadonlyArray<() => unknown | Promise<unknown>>;
}): OnboardingLoadState {
  if (input.pending) return { kind: "loading" };
  if (!input.failed) return { kind: "ready" };

  const copy = onboardingRecoveryPolicy[input.scope];
  return {
    kind: "error",
    message: copy.message,
    action: {
      label: copy.action,
      run: async () => {
        await Promise.all(input.reload.map((reload) => reload()));
      },
    },
  };
}

export async function completeOnboardingFlow<T>(input: {
  request: () => Promise<T>;
  commit: (result: T) => unknown | Promise<unknown>;
}): Promise<void> {
  const result = await input.request();
  await input.commit(result);
}
