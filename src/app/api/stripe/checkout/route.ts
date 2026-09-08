import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

/** New Peek+ sales remain closed until every paid feature is ready for launch. */
export const POST = withAuth(async () =>
  apiError("Peek+ is not available to purchase yet.", 503, "NOT_AVAILABLE"),
);
