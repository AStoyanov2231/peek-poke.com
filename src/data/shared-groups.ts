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
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

export function fetchSharedGroups(signal?: AbortSignal) {
  return fetchContract("/api/groups?limit=100", sharedGroupsResponseSchema, { signal });
}

export function joinSharedGroup(qrContent: string): Promise<SharedGroupJoinResponse> {
  const body = sharedGroupJoinRequestSchema.parse({ qr_content: qrContent });
  return fetchContract("/api/groups", sharedGroupJoinResponseSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchSharedGroupMessages(
  groupId: string,
  cursor: string | null = null,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ limit: "100" });
  if (cursor) query.set("cursor", cursor);
  return fetchContract(
    `/api/groups/${encodeURIComponent(groupId)}?${query.toString()}`,
    sharedGroupMessagesResponseSchema,
    { signal },
  );
}

export function sendSharedGroupMessage(
  groupId: string,
  attempt: SharedGroupMessageCreate,
) {
  const body = sharedGroupMessageCreateSchema.parse(attempt);
  return fetchContract(`/api/groups/${encodeURIComponent(groupId)}`, messageMutationResponseSchema, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": body.client_id,
    },
    body: JSON.stringify(body),
  });
}

export function markSharedGroupRead(groupId: string, signal?: AbortSignal) {
  return fetchContract(
    `/api/groups/${encodeURIComponent(groupId)}/read`,
    readReceiptResponseSchema,
    { method: "POST", signal },
  );
}
