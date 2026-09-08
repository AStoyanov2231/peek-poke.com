import {
  pokeInboxResponseSchema,
  pokeResponseRequestSchema,
  pokeResponseSchema,
  type Poke,
  type PokeInboxItem,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

export function fetchPokes(signal?: AbortSignal) {
  return fetchContract("/api/pokes?limit=20", pokeInboxResponseSchema, {
    signal,
  });
}

export function respondToPoke(
  pokeId: string,
  action: "accept" | "later" | "decline",
  idempotencyKey = crypto.randomUUID(),
) {
  return fetchContract(
    `/api/pokes/${encodeURIComponent(pokeId)}`,
    pokeResponseSchema,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(pokeResponseRequestSchema.parse({ action })),
    },
  );
}

export function activityLabel(poke: Pick<Poke, "activity" | "customLabel">) {
  if (poke.activity === "custom")
    return poke.customLabel ?? "Something spontaneous";
  return poke.activity.charAt(0).toUpperCase() + poke.activity.slice(1);
}

export function isActivePendingPoke(
  poke: Pick<PokeInboxItem, "status" | "expiresAt">,
  now = Date.now(),
) {
  return poke.status === "pending" && new Date(poke.expiresAt).getTime() > now;
}
