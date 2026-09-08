import { NextResponse } from "next/server";
import { discoveryPreferenceSchema } from "@peekpoke/shared";
import { apiError } from "@/lib/api-error";
import { withAuth } from "@/lib/auth";
import { withNoStore } from "@/lib/no-store-response";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/validators";

function unavailable() {
  return apiError("Discovery preferences are temporarily unavailable", 503, "DISCOVERY_PREFERENCES_UNAVAILABLE");
}

export const GET = withNoStore(withAuth(async (_request, { user }) => {
  const { data, error } = await createServiceClient().rpc("read_discovery_preference", {
    p_user_id: user.id,
  });
  if (error) {
    console.error("discovery-preferences/GET:", error);
    return unavailable();
  }
  const parsed = discoveryPreferenceSchema.safeParse(data);
  if (!parsed.success) {
    console.error("discovery-preferences/GET: invalid RPC response", parsed.error.flatten());
    return unavailable();
  }
  return NextResponse.json(parsed.data);
}));

export const PATCH = withNoStore(withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("discoveryPreferences", user.id);
  if (limited) return limited;
  const [body, bodyError] = await parseBody(request, discoveryPreferenceSchema);
  if (bodyError) return bodyError;
  const { data, error } = await createServiceClient().rpc("update_discovery_preference", {
    p_user_id: user.id,
    p_audience: body.audience,
  });
  if (error) {
    console.error("discovery-preferences/PATCH:", error);
    return unavailable();
  }
  const parsed = discoveryPreferenceSchema.safeParse(data);
  if (!parsed.success) {
    console.error("discovery-preferences/PATCH: invalid RPC response", parsed.error.flatten());
    return unavailable();
  }
  return NextResponse.json(parsed.data);
}));
