import type { PokeInboxItem } from "@peekpoke/shared";

export function pokeActivityLabel(poke: Pick<PokeInboxItem, "activity" | "customLabel">) {
  if (poke.activity === "custom") return poke.customLabel ?? "Something spontaneous";
  return `${poke.activity.charAt(0).toUpperCase()}${poke.activity.slice(1)}`;
}

export function pokeExpiryLabel(expiresAt: string, nowMs = Date.now()) {
  const endsAt = Date.parse(expiresAt);
  if (!Number.isFinite(endsAt) || endsAt <= nowMs) return "Expired";

  return `Expires ${new Date(endsAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function pokeStateLabel(
  poke: Pick<PokeInboxItem, "status" | "expiresAt">,
  nowMs = Date.now(),
) {
  if (poke.status === "pending" && Date.parse(poke.expiresAt) <= nowMs) return "Expired";
  return {
    pending: "Waiting for a reply",
    accepted: "Accepted",
    later: "Later",
    declined: "Declined",
    expired: "Expired",
  }[poke.status];
}
