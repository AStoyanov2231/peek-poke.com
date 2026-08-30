import {
  dmThreadCreateRequestSchema,
  dmThreadCreateResponseSchemaFor,
  type DmThreadCreateResponse,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

const inFlightThreadCreates = new Map<string, Promise<DmThreadCreateResponse>>();

export function createOrFindThread(userId: string): Promise<DmThreadCreateResponse> {
  const body = dmThreadCreateRequestSchema.parse({ user_id: userId });
  const existing = inFlightThreadCreates.get(body.user_id);
  if (existing) return existing;

  const request = fetchContract(
    "/api/dm/threads",
    dmThreadCreateResponseSchemaFor(body.user_id),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    },
  );
  const shared = request.finally(() => {
    if (inFlightThreadCreates.get(body.user_id) === shared) {
      inFlightThreadCreates.delete(body.user_id);
    }
  });
  inFlightThreadCreates.set(body.user_id, shared);
  return shared;
}
