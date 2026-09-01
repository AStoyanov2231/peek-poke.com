import { NextResponse } from "next/server";
import { z } from "zod";
import {
  nearbyResponseSchemaForViewer,
  type NearbyResponseDto,
} from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { withNoStore } from "@/lib/no-store-response";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { coordsSchema, parseBody } from "@/lib/validators";

const nearbyRowSchema = z.strictObject({
  user_id: z.uuid(),
  username: z.string().min(1).max(64),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  is_online: z.boolean(),
  last_seen_at: z.string().datetime({ offset: true }).nullable(),
  lat: z.number().finite(),
  lng: z.number().finite(),
  meeting_eligible: z.boolean().optional().default(false),
});

export const POST = withNoStore(withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("nearby", user.id);
  if (limited) return limited;

  const [, bodyError] = await parseBody(request, coordsSchema);
  if (bodyError) return bodyError;

  const { data, error } = await createServiceClient().rpc("nearby_users_for_user", {
    p_user_id: user.id,
    p_radius_km: 2,
  });
  if (error) {
    console.error("nearby: query failed", error);
    return apiError("Nearby discovery is temporarily unavailable", 503, "NEARBY_FETCH_FAILED");
  }

  const rows = z.array(nearbyRowSchema).max(100).safeParse(data ?? []);
  if (!rows.success) {
    console.error("nearby: malformed query response");
    return apiError("Nearby discovery is temporarily unavailable", 503, "NEARBY_FETCH_FAILED");
  }

  const response = nearbyResponseSchemaForViewer(
    user.id,
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  ).safeParse({
    users: rows.data.map((row) => ({
      userId: row.user_id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      is_online: row.is_online,
      last_seen_at: row.last_seen_at,
      lat: row.lat,
      lng: row.lng,
      meeting_eligible: row.meeting_eligible,
    })),
  } satisfies NearbyResponseDto);
  if (!response.success) {
    console.error("nearby: invalid response contract");
    return apiError("Nearby discovery is temporarily unavailable", 503, "NEARBY_FETCH_FAILED");
  }
  return NextResponse.json(response.data);
}));
