import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { withNoStore } from "@/lib/no-store-response";
import { enforceRateLimit } from "@/lib/rate-limit";

export const POST = withNoStore(withAuth(async (_request, { user }) => {
  const limited = await enforceRateLimit("location", user.id);
  if (limited) return limited;
  return apiError("Location verification is unavailable", 503, "LOCATION_VERIFICATION_UNAVAILABLE");
}));
