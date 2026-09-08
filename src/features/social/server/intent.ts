import { availabilityUpsertRequestSchema } from "@peekpoke/shared";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import {
  availabilityReadRpcResultSchema,
  availabilityRpcResultSchema,
} from "./contracts";

export async function readAvailability(
  viewerId: string,
  limit: number,
  radiusKm: number,
) {
  const { data, error } = await createServiceClient().rpc(
    "get_available_people",
    {
      p_viewer_id: viewerId,
      p_limit: limit,
      p_radius_km: radiusKm,
    },
  );
  if (error) {
    console.error("availability read:", error);
    return {
      error: apiError(
        "Availability is temporarily unavailable",
        503,
        "AVAILABILITY_UNAVAILABLE",
      ),
    };
  }
  const parsed = availabilityReadRpcResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("availability read: malformed RPC response");
    return {
      error: apiError(
        "Availability is temporarily unavailable",
        503,
        "AVAILABILITY_UNAVAILABLE",
      ),
    };
  }
  return { data: parsed.data };
}

export async function upsertAvailability(viewerId: string, body: unknown) {
  const request = availabilityUpsertRequestSchema.safeParse(body);
  if (!request.success)
    return { error: apiError("Invalid availability", 400, "VALIDATION_ERROR") };
  const { data, error } = await createServiceClient().rpc(
    "upsert_user_availability",
    {
      p_user_id: viewerId,
      p_activity: request.data.activity,
      p_custom_label: request.data.customLabel,
      p_duration_minutes: request.data.durationMinutes,
    },
  );
  if (error) {
    console.error("availability upsert:", error);
    return {
      error: apiError(
        "Availability is temporarily unavailable",
        503,
        "AVAILABILITY_UNAVAILABLE",
      ),
    };
  }
  const parsed = availabilityRpcResultSchema.safeParse(data);
  if (!parsed.success || parsed.data.availability?.userId !== viewerId) {
    console.error("availability upsert: malformed RPC response");
    return {
      error: apiError(
        "Availability is temporarily unavailable",
        503,
        "AVAILABILITY_UNAVAILABLE",
      ),
    };
  }
  return { data: parsed.data };
}

export async function clearAvailability(viewerId: string) {
  const { data, error } = await createServiceClient().rpc(
    "clear_user_availability",
    { p_user_id: viewerId },
  );
  if (error || data !== true) {
    console.error("availability clear:", error ?? "unexpected result");
    return {
      error: apiError(
        "Availability is temporarily unavailable",
        503,
        "AVAILABILITY_UNAVAILABLE",
      ),
    };
  }
  return { data: { availability: null } };
}
