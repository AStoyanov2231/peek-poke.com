import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";
import { verifyInviteToken } from "@/lib/invite-token";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { inviteAcceptanceResponseSchemaFor } from "@peekpoke/shared";
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
