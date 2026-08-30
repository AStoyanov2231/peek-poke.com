import { messageCreateSchema } from "./contract";

export type ChatMessageDraft = {
  content: string;
  replyToId?: string | null;
  mediaUrl?: string;
  mediaThumbnailUrl?: string | null;
};

export type ChatMessagePayload = {
  client_id: string;
  content: string;
  message_type?: "image";
  media_url?: string;
  media_thumbnail_url?: string;
  reply_to_id?: string;
};

export type ChatMessageAttempt = {
  clientId: string;
  draft: Readonly<ChatMessageDraft>;
  payload: Readonly<ChatMessagePayload>;
};

export type ChatMessageAttemptCoordinator = {
  prepare: (draft: ChatMessageDraft) => ChatMessageAttempt;
  run: <Result>(
    draft: ChatMessageDraft,
    deliver: (attempt: ChatMessageAttempt) => Promise<Result>,
  ) => Promise<Result>;
  matches: (draft: ChatMessageDraft) => boolean;
  peek: () => ChatMessageAttempt | null;
  cancel: () => boolean;
  reset: () => void;
};

export type ChatMessageSubmissionToken = Readonly<{
  generation: number;
  nonce: symbol;
  ownerIdentity: PropertyKey;
}>;

export type ChatMessageUiLifecycle = {
  begin: () => ChatMessageSubmissionToken | null;
  end: (token: ChatMessageSubmissionToken) => void;
  isCurrent: (token: ChatMessageSubmissionToken) => boolean;
  isGenerationCurrent: (token: ChatMessageSubmissionToken) => boolean;
  runIfCurrent: <Result>(
    token: ChatMessageSubmissionToken,
    effect: () => Result,
  ) => Result | undefined;
  commitOnce: <Result>(
    token: ChatMessageSubmissionToken,
    commitKey: PropertyKey,
    commit: () => Result,
  ) => Result | undefined;
  reset: () => void;
};

const FINGERPRINT_CLIENT_ID = "00000000-0000-4000-8000-000000000000";
const DEFAULT_UI_OWNER_IDENTITY = Symbol("default-chat-message-owner");

export function createChatMessagePayload(
  draft: ChatMessageDraft,
  clientId: string,
): ChatMessagePayload {
  const parsed = messageCreateSchema.parse({
    client_id: clientId,
    content: draft.content,
    ...(draft.mediaUrl
      ? {
          message_type: "image" as const,
          media_url: draft.mediaUrl,
          ...(draft.mediaThumbnailUrl
            ? { media_thumbnail_url: draft.mediaThumbnailUrl }
            : {}),
        }
      : {}),
    ...(draft.replyToId ? { reply_to_id: draft.replyToId } : {}),
  });

  return {
    client_id: parsed.client_id,
    content: parsed.content,
    ...(parsed.message_type === "image"
      ? {
          message_type: parsed.message_type,
          media_url: parsed.media_url!,
          ...(parsed.media_thumbnail_url
            ? { media_thumbnail_url: parsed.media_thumbnail_url }
            : {}),
        }
      : {}),
    ...(parsed.reply_to_id ? { reply_to_id: parsed.reply_to_id } : {}),
  };
}

function normalizeDraft(draft: ChatMessageDraft): Readonly<ChatMessageDraft> {
  const payload = createChatMessagePayload(draft, FINGERPRINT_CLIENT_ID);
  return Object.freeze({
    content: payload.content,
    ...(payload.reply_to_id ? { replyToId: payload.reply_to_id } : {}),
    ...(payload.media_url
      ? {
          mediaUrl: payload.media_url,
          ...(payload.media_thumbnail_url
            ? { mediaThumbnailUrl: payload.media_thumbnail_url }
            : {}),
        }
      : {}),
  });
}

function fingerprint(draft: ChatMessageDraft) {
  return JSON.stringify(createChatMessagePayload(draft, FINGERPRINT_CLIENT_ID));
}

export function createChatMessageAttemptCoordinator(
  createClientId: () => string,
): ChatMessageAttemptCoordinator {
  let pending: { key: string; attempt: ChatMessageAttempt } | null = null;
  let inFlight: { key: string; promise: Promise<unknown> } | null = null;

  function prepare(draft: ChatMessageDraft) {
    const key = fingerprint(draft);
    if (pending?.key === key) return pending.attempt;
    if (inFlight) {
      throw new Error("A different message attempt is already being sent");
    }

    const normalizedDraft = normalizeDraft(draft);
    const clientId = createClientId();
    const attempt = Object.freeze({
      clientId,
      draft: normalizedDraft,
      payload: Object.freeze(createChatMessagePayload(normalizedDraft, clientId)),
    });
    pending = { key, attempt };
    return attempt;
  }

  function run<Result>(
    draft: ChatMessageDraft,
    deliver: (attempt: ChatMessageAttempt) => Promise<Result>,
  ): Promise<Result> {
    const key = fingerprint(draft);
    if (inFlight) {
      if (inFlight.key === key) return inFlight.promise as Promise<Result>;
      return Promise.reject(new Error("A different message attempt is already being sent"));
    }

    const attempt = prepare(draft);
    const promise = Promise.resolve()
      .then(() => deliver(attempt))
      .then(
        (result) => {
          if (pending?.attempt.clientId === attempt.clientId) pending = null;
          if (inFlight?.promise === promise) inFlight = null;
          return result;
        },
        (error: unknown) => {
          if (inFlight?.promise === promise) inFlight = null;
          throw error;
        },
      );
    inFlight = { key, promise };
    return promise;
  }

  return {
    prepare,
    run,
    matches(draft) {
      try {
        return pending?.key === fingerprint(draft);
      } catch {
        return false;
      }
    },
    peek() {
      return pending?.attempt ?? null;
    },
    cancel() {
      if (inFlight) return false;
      pending = null;
      return true;
    },
    reset() {
      pending = null;
      inFlight = null;
    },
  };
}

export function createChatMessageUiLifecycle(
  getCurrentOwnerIdentity: () => PropertyKey | null = () => DEFAULT_UI_OWNER_IDENTITY,
): ChatMessageUiLifecycle {
  let activeToken: ChatMessageSubmissionToken | null = null;
  let generation = 0;
  const committedKeysByOwner = new Map<PropertyKey, Set<PropertyKey>>();

  function hasCurrentOwner(token: ChatMessageSubmissionToken) {
    return getCurrentOwnerIdentity() === token.ownerIdentity;
  }

  return {
    begin() {
      if (activeToken && !hasCurrentOwner(activeToken)) activeToken = null;
      if (activeToken) return null;
      const ownerIdentity = getCurrentOwnerIdentity();
      if (ownerIdentity === null) return null;
      activeToken = Object.freeze({
        generation,
        nonce: Symbol("chat-message-submission"),
        ownerIdentity,
      });
      return activeToken;
    },
    end(token) {
      if (activeToken === token) activeToken = null;
    },
    isCurrent(token) {
      return activeToken === token
        && token.generation === generation
        && hasCurrentOwner(token);
    },
    isGenerationCurrent(token) {
      return token.generation === generation && hasCurrentOwner(token);
    },
    runIfCurrent(token, effect) {
      if (
        activeToken !== token
        || token.generation !== generation
        || !hasCurrentOwner(token)
      ) return undefined;
      return effect();
    },
    commitOnce(token, commitKey, commit) {
      if (
        activeToken !== token
        || token.generation !== generation
        || !hasCurrentOwner(token)
      ) return undefined;
      const committedKeys = committedKeysByOwner.get(token.ownerIdentity) ?? new Set<PropertyKey>();
      if (committedKeys.has(commitKey)) return undefined;
      committedKeys.add(commitKey);
      committedKeysByOwner.set(token.ownerIdentity, committedKeys);
      return commit();
    },
    reset() {
      generation += 1;
      activeToken = null;
      committedKeysByOwner.clear();
    },
  };
}
