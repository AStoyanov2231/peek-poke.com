import {
  messageMutationResponseSchema,
  readReceiptResponseSchema,
  sharedGroupJoinRequestSchema,
  sharedGroupJoinResponseSchema,
  sharedGroupMessageCreateSchema,
  sharedGroupMessagesResponseSchema,
  sharedGroupsResponseSchema,
  type SharedGroupJoinResponse,
  type SharedGroupMessageCreate,
  type SharedGroupMessagesResponse,
  type SharedGroupsResponse,
  type MessageMutationResponse,
  type ReadReceiptResponse,
} from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";

export function fetchSharedGroups(): Promise<SharedGroupsResponse> {
  return apiFetch<SharedGroupsResponse>("/api/groups?limit=100", { responseSchema: sharedGroupsResponseSchema });
}

export function joinSharedGroup(qrContent: string): Promise<SharedGroupJoinResponse> {
  const body = sharedGroupJoinRequestSchema.parse({ qr_content: qrContent });
  return apiFetch("/api/groups", {
    method: "POST",
    body: jsonBody(body),
    responseSchema: sharedGroupJoinResponseSchema,
  });
}

export function fetchSharedGroupMessages(
  groupId: string,
  cursor: string | null = null,
  signal?: AbortSignal,
): Promise<SharedGroupMessagesResponse> {
  const query = new URLSearchParams({ limit: "100" });
  if (cursor) query.set("cursor", cursor);
  return apiFetch(`/api/groups/${encodeURIComponent(groupId)}?${query.toString()}`, {
    signal,
    responseSchema: sharedGroupMessagesResponseSchema,
  });
}

export function sendSharedGroupMessage(
  groupId: string,
  attempt: SharedGroupMessageCreate,
): Promise<MessageMutationResponse> {
  const body = sharedGroupMessageCreateSchema.parse(attempt);
  return apiFetch(`/api/groups/${encodeURIComponent(groupId)}`, {
    method: "POST",
    body: jsonBody(body),
    headers: { "idempotency-key": body.client_id },
    responseSchema: messageMutationResponseSchema,
  });
}

export function markSharedGroupRead(groupId: string, signal?: AbortSignal): Promise<ReadReceiptResponse> {
  return apiFetch(`/api/groups/${encodeURIComponent(groupId)}/read`, {
    method: "POST",
    signal,
    responseSchema: readReceiptResponseSchema,
  });
}
