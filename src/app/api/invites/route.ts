import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createInviteToken } from "@/lib/invite-token";
import { apiError } from "@/lib/api-error";
import { inviteLinkResponseSchemaForOrigin, isAllowedInviteOrigin } from "@peekpoke/shared";
import { withNoStore } from "@/lib/no-store-response";

export const GET = withNoStore(withAuth(async (_request, { user }) => {
  let payload: unknown;
  try {
    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!configuredAppUrl) {
      throw new Error("NEXT_PUBLIC_APP_URL is required for invite links");
    }
    const configured = new URL(configuredAppUrl);
    if (
      (configuredAppUrl !== configured.origin && configuredAppUrl !== `${configured.origin}/`)
      || configured.username
      || configured.password
      || configured.pathname !== "/"
      || configured.search
      || configured.hash
    ) {
      throw new Error("NEXT_PUBLIC_APP_URL must contain only an origin");
    }
    const origin = configured.origin;
    const allowDevelopmentHttp = process.env.NODE_ENV === "development";
    if (!isAllowedInviteOrigin(origin, allowDevelopmentHttp)) {
      throw new Error("Invite origin must use HTTPS");
    }
    const token = createInviteToken(user.id);
    payload = inviteLinkResponseSchemaForOrigin(origin, { allowDevelopmentHttp }).parse({
      invite_url: `${origin}/invite/${token}`,
    });
  } catch {
    return apiError("Invite links are unavailable", 503, "INVITE_UNAVAILABLE");
  }

  return NextResponse.json(payload);
}));
