import { z } from "zod";
import { dmMessageEditRequestSchema, idempotencyKeySchema } from "./contract";

const mutationScopeSchema = z.strictObject({
  accountId: z.uuid(),
  threadId: z.uuid(),
  messageId: z.uuid(),
});

export type DmMessageMutationScope = z.infer<typeof mutationScopeSchema>;
export type DmMessageMutation =
  | Readonly<{ kind: "edit"; content: string }>
  | Readonly<{ kind: "delete" }>;

export type DmMessageMutationAttempt = Readonly<{
  idempotencyKey: string;
  generation: number;
  scope: Readonly<DmMessageMutationScope>;
  mutation: DmMessageMutation;
}>;

export type DmMessageMutationCoordinator = {
  prepare: (
    scope: DmMessageMutationScope,
    mutation: DmMessageMutation,
  ) => DmMessageMutationAttempt;
  run: <Result>(
    scope: DmMessageMutationScope,
    mutation: DmMessageMutation,
    deliver: (attempt: DmMessageMutationAttempt) => Promise<Result>,
  ) => Promise<Result>;
  peek: () => DmMessageMutationAttempt | null;
  isGenerationCurrent: (attempt: DmMessageMutationAttempt) => boolean;
  cancel: () => boolean;
  reset: () => void;
};

function normalizeMutation(mutation: DmMessageMutation): DmMessageMutation {
  if (mutation.kind === "delete") return Object.freeze({ kind: "delete" as const });
  const body = dmMessageEditRequestSchema.parse({ content: mutation.content });
  return Object.freeze({ kind: "edit" as const, content: body.content });
}

function attemptFingerprint(
  scope: DmMessageMutationScope,
  mutation: DmMessageMutation,
) {
  const parsedScope = mutationScopeSchema.parse(scope);
  const normalizedMutation = normalizeMutation(mutation);
  return {
    key: JSON.stringify({ scope: parsedScope, mutation: normalizedMutation }),
    scope: Object.freeze(parsedScope),
    mutation: normalizedMutation,
  };
}

export function createDmMessageMutationCoordinator(
  createIdempotencyKey: () => string,
): DmMessageMutationCoordinator {
  let generation = 0;
  let activeScopeKey: string | null = null;
  let pending: { key: string; attempt: DmMessageMutationAttempt } | null = null;
  let inFlight: { key: string; promise: Promise<unknown> } | null = null;

  function prepare(scope: DmMessageMutationScope, mutation: DmMessageMutation) {
    const normalized = attemptFingerprint(scope, mutation);
    if (pending?.key === normalized.key) return pending.attempt;
    if (inFlight) throw new Error("A different message mutation is already in progress");

    generation += 1;
    activeScopeKey = JSON.stringify(normalized.scope);
    const attempt = Object.freeze({
      idempotencyKey: idempotencyKeySchema.parse(createIdempotencyKey()),
      generation,
      scope: normalized.scope,
      mutation: normalized.mutation,
    });
    pending = { key: normalized.key, attempt };
    return attempt;
  }

  function run<Result>(
    scope: DmMessageMutationScope,
    mutation: DmMessageMutation,
    deliver: (attempt: DmMessageMutationAttempt) => Promise<Result>,
  ) {
    const normalized = attemptFingerprint(scope, mutation);
    if (inFlight) {
      if (inFlight.key === normalized.key) return inFlight.promise as Promise<Result>;
      return Promise.reject(new Error("A different message mutation is already in progress"));
    }

    const attempt = prepare(scope, mutation);
    const promise = Promise.resolve()
      .then(() => deliver(attempt))
      .then(
        (result) => {
          if (pending?.attempt === attempt) pending = null;
          if (inFlight?.promise === promise) inFlight = null;
          return result;
        },
        (error: unknown) => {
          if (inFlight?.promise === promise) inFlight = null;
          throw error;
        },
      );
    inFlight = { key: normalized.key, promise };
    return promise;
  }

  return {
    prepare,
    run,
    peek() {
      return pending?.attempt ?? null;
    },
    isGenerationCurrent(attempt) {
      return attempt.generation === generation
        && activeScopeKey === JSON.stringify(attempt.scope);
    },
    cancel() {
      if (inFlight) return false;
      generation += 1;
      activeScopeKey = null;
      pending = null;
      return true;
    },
    reset() {
      generation += 1;
      activeScopeKey = null;
      pending = null;
      inFlight = null;
    },
  };
}
