import { NextResponse } from "next/server";
import {
  normalizeSearchQuery,
  searchTagRequestSchema,
  searchTagResultsSchemaForLimit,
} from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";

export const GET = withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("search", user.id);
  if (limited) return limited;

  const parsed = searchTagRequestSchema.safeParse(
    normalizeSearchQuery(new URL(request.url).searchParams),
  );
  if (!parsed.success) return apiError("Invalid search query", 400, "INVALID_PARAMS");

  const { data, error } = await createServiceClient().rpc("search_interest_tags", {
    q: parsed.data.q,
  });
  if (error) {
    console.error("search/tags:", error);
    return apiError("Search failed", 500, "SEARCH_FAILED");
  }
  const results = searchTagResultsSchemaForLimit(parsed.data.limit).safeParse(data);
  if (!results.success) {
    console.error("search/tags: invalid response", results.error);
    return apiError("Search failed", 500, "SEARCH_FAILED");
  }
  return NextResponse.json(results.data);
});
