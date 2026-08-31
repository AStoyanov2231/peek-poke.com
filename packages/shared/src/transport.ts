import type { ZodType } from "zod";
import {
  authProfileEnsureRequestSchema,
  authProfileEnsureResponseSchema,
  bootstrapSchema,
  coinsResponseSchema,
  dmInboxResponseSchema,
  dmThreadCreateRequestSchema,
  dmThreadCreateResponseSchema,
  friendsReadResponseSchema,
  friendRequestsReadResponseSchema,
  inviteAcceptanceResponseSchema,
  inviteLinkResponseSchema,
  meetingRequestSchema,
  meetingResponseSchema,
  messagesResponseSchema,
  readReceiptResponseSchema,
  publicProfileResponseSchema,
} from "./contract";
import { apiErrorEnvelopeSchema, type ApiErrorEnvelope } from "./errors";

export const DEFAULT_API_TIMEOUT_MS = 30_000;

export function createRequestSignal(
  source: AbortSignal | null | undefined,
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
) {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromSource = () => controller.abort(source?.reason);
  if (source?.aborted) abortFromSource();
  else source?.addEventListener("abort", abortFromSource, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timeout);
      source?.removeEventListener("abort", abortFromSource);
    },
  };
}

export type ContractEndpoint<TRequest, TResponse> = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  request: ZodType<TRequest> | null;
  response: ZodType<TResponse>;
};

export const endpointContracts = {
  authProfileEnsure: {
    method: "POST",
    path: "/api/auth/profile",
    request: authProfileEnsureRequestSchema,
    response: authProfileEnsureResponseSchema,
  },
  bootstrap: {
    method: "GET",
    path: "/api/bootstrap",
    request: null,
    response: bootstrapSchema,
  },
  coins: {
    method: "GET",
    path: "/api/coins",
    request: null,
    response: coinsResponseSchema,
  },
  meeting: {
    method: "POST",
    path: "/api/coins/meeting",
    request: meetingRequestSchema,
    response: meetingResponseSchema,
  },
  friends: {
    method: "GET",
    path: "/api/friends",
    request: null,
    response: friendsReadResponseSchema,
  },
  friendRequests: {
    method: "GET",
    path: "/api/friends/requests",
    request: null,
    response: friendRequestsReadResponseSchema,
  },
  threads: {
    method: "GET",
    path: "/api/dm/threads",
    request: null,
    response: dmInboxResponseSchema,
  },
  threadCreate: {
    method: "POST",
    path: "/api/dm/threads",
    request: dmThreadCreateRequestSchema,
    response: dmThreadCreateResponseSchema,
  },
  messages: {
    method: "GET",
    path: "/api/dm/:threadId",
    request: null,
    response: messagesResponseSchema,
  },
  threadRead: {
    method: "POST",
    path: "/api/dm/:threadId/read",
    request: null,
    response: readReceiptResponseSchema,
  },
  profile: {
    method: "GET",
    path: "/api/profile/:userId",
    request: null,
    response: publicProfileResponseSchema,
  },
  inviteLink: {
    method: "GET",
    path: "/api/invites",
    request: null,
    response: inviteLinkResponseSchema,
  },
  inviteAcceptance: {
    method: "POST",
    path: "/api/invites/:inviterId",
    request: null,
    response: inviteAcceptanceResponseSchema,
  },
} as const;

export function parseContractPayload<T>(schema: ZodType<T>, payload: unknown): T {
  return schema.parse(payload);
}

export function parseContractError(payload: unknown): ApiErrorEnvelope | null {
  const result = apiErrorEnvelopeSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function parseResponseJson(text: string): { success: true; data: unknown } | { success: false } {
  if (!text) return { success: true, data: null };
  try {
    return { success: true, data: JSON.parse(text) as unknown };
  } catch {
    return { success: false };
  }
}
