import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { withNoStore } from "@/lib/no-store-response";

// Client-provided coordinates cannot prove physical presence, so meeting
// rewards remain unavailable until the backend accepts an attested signal.
export const POST = withNoStore(withAuth(async () =>
  apiError("Location verification is unavailable", 503, "LOCATION_VERIFICATION_UNAVAILABLE")
));
