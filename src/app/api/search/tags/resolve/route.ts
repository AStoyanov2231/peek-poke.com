import { NextResponse } from "next/server";
import { resolvedTagsSchemaForRequest } from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, resolveTagsSchema } from "@/lib/validators";

export const POST = withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("search", user.id);
  if (limited) return limited;

  const [body, bodyError] = await parseBody(request, resolveTagsSchema);
  if (bodyError) return bodyError;

  const { data, error } = await createServiceClient().rpc("resolve_interest_tags", {
    names: body.names,
  });
  if (error) {
    console.error("search/tags/resolve:", error);
    return apiError("Search failed", 500, "SEARCH_FAILED");
  }
  const results = resolvedTagsSchemaForRequest(body.names).safeParse(data);
  if (!results.success) {
    console.error("search/tags/resolve: invalid response", results.error);
    return apiError("Search failed", 500, "SEARCH_FAILED");
  }
  return NextResponse.json(results.data);
});
