import {
  inviteAcceptanceResponseSchemaForToken,
  inviteLinkResponseSchemaForOrigin,
  type InviteAcceptanceResponse,
  type InviteLinkResponse,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

const inFlightAccepts = new Map<string, Promise<InviteAcceptanceResponse>>();

export function fetchInviteLink(signal?: AbortSignal): Promise<InviteLinkResponse> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Invite links are unavailable"));
  }
  return fetchContract("/api/invites", inviteLinkResponseSchemaForOrigin(window.location.origin, {
    allowDevelopmentHttp: process.env.NODE_ENV === "development",
  }), {
    cache: "no-store",
    signal,
  });
}

export function acceptInvite(token: string): Promise<InviteAcceptanceResponse> {
  const existing = inFlightAccepts.get(token);
  if (existing) return existing;

  const request = fetchContract(
    `/api/invites/${encodeURIComponent(token)}`,
    inviteAcceptanceResponseSchemaForToken(token),
    { method: "POST", cache: "no-store" },
  );
  const shared = request.finally(() => {
    if (inFlightAccepts.get(token) === shared) inFlightAccepts.delete(token);
  });
  inFlightAccepts.set(token, shared);
  return shared;
}
