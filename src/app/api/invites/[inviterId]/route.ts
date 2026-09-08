import { NextResponse } from "next/server";
import { isBlocked, withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";
import { verifyInviteToken } from "@/lib/invite-token";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { inviteAcceptanceResponseSchemaFor } from "@peekpoke/shared";
import { profileCardSchema } from "@peekpoke/shared";
import { z } from "zod";
import { withNoStore } from "@/lib/no-store-response";

export const POST = withNoStore(withAuth<{ inviterId: string }>(async (_request, { user, params }) => {
  const inviterId = verifyInviteToken(params.inviterId);

  if (!inviterId || !isValidUUID(inviterId)) {
    return apiError("This invite is invalid or expired", 400, "INVALID_INVITE");
  }

  if (user.id === inviterId) {
    return NextResponse.json(
      inviteAcceptanceResponseSchemaFor(inviterId).parse({
        profile_id: inviterId,
      }),
    );
  }
  const limited = await enforceRateLimit("inviteAccept", user.id);
  if (limited) return limited;

  const { error } = await createServiceClient().rpc("accept_invite_link_for_user", {
    p_user_id: user.id,
    p_inviter_id: inviterId,
  });
  if (error) {
    console.error("api/invites/[inviterId]:", error);
    return apiError("Could not accept invite", 500, "INVITE_ACCEPT_FAILED");
  }

  return NextResponse.json(
    inviteAcceptanceResponseSchemaFor(inviterId).parse({
      profile_id: inviterId,
    }),
  );
}));

const invitePreviewSchema = z.strictObject({ profile: profileCardSchema });

/** Reads a signed invite's public card without creating a friendship. */
export const GET = withNoStore(withAuth<{ inviterId: string }>(async (_request, { user, supabase, params }) => {
  const inviterId = verifyInviteToken(params.inviterId);
  if (!inviterId || !isValidUUID(inviterId)) return apiError("This invite is invalid or expired", 400, "INVALID_INVITE");
  if (user.id !== inviterId && await isBlocked(supabase, user.id, inviterId)) {
    return apiError("This invite is unavailable", 404, "INVITE_NOT_FOUND");
  }
  const { data, error } = await createServiceClient()
    .from("profiles")
    .select("id, username, display_name, avatar_url, location_text, is_online, last_seen_at")
    .eq("id", inviterId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("api/invites/[inviterId] preview:", error);
    return apiError("This invite is temporarily unavailable", 503, "INVITE_PREVIEW_UNAVAILABLE");
  }
  const parsed = invitePreviewSchema.safeParse({ profile: data });
  if (!parsed.success) return apiError("This invite is unavailable", 404, "INVITE_NOT_FOUND");
  return NextResponse.json(parsed.data, { headers: { "cache-control": "no-store" } });
}));
