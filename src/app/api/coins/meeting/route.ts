import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { withNoStore } from "@/lib/no-store-response";

// Approximate discovery coordinates cannot prove physical presence. Meeting
// rewards remain unavailable until the backend accepts an attested signal.
export const POST = withNoStore(withAuth(async () =>
  apiError("Meeting rewards need device location verification, which is not available yet", 503, "LOCATION_VERIFICATION_UNAVAILABLE")
));
