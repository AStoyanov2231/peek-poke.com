import { NextResponse } from "next/server";
import {
  API_VERSION,
  decodeCursor,
  normalizeUserSearchQuery,
  paginateCursor,
  searchUserResultsSchemaForLimit,
  searchUserRpcResultsSchema,
  userSearchQuerySchema,
} from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, userSearchSchema } from "@/lib/validators";

export const POST = withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("search", user.id);
  if (limited) return limited;

  const rawQuery = normalizeUserSearchQuery(new URL(request.url).searchParams);
  const query = userSearchQuerySchema.safeParse(rawQuery);
  if (!query.success) {
    const rawCursor = rawQuery && typeof rawQuery === "object" && "cursor" in rawQuery
      ? (rawQuery as { cursor?: unknown }).cursor
      : undefined;
    const invalidCursor = typeof rawCursor === "string" && decodeCursor(rawCursor) === null;
    return apiError(
      invalidCursor ? "Invalid cursor" : "Invalid pagination",
      400,
      invalidCursor ? "INVALID_CURSOR" : "INVALID_PAGINATION",
    );
  }

  const [body, bodyError] = await parseBody(request, userSearchSchema);
  if (bodyError) return bodyError;

  const { data, error } = await createServiceClient().rpc("search_users_for_user", {
    p_user_id: user.id,
    q: body.q,
    tag_ids: body.tag_ids,
    nearby_ids: body.nearby_ids,
    result_limit: 51,
  });
  if (error) {
    console.error("search/users:", error);
    return apiError("Search failed", 500, "SEARCH_FAILED");
  }
  const results = searchUserRpcResultsSchema.safeParse(data);
  if (!results.success) {
    console.error("search/users: invalid response", results.error);
    return apiError("Search failed", 500, "SEARCH_FAILED");
  }
  const sorted = results.data
    .map((item) => ({ value: item, id: item.id, sort_value: String(item.rank) }))
    .sort((left, right) => left.sort_value.localeCompare(right.sort_value) || left.id.localeCompare(right.id));
  const page = paginateCursor(sorted, query.data.limit, query.data.cursor);
  const responseItems = searchUserResultsSchemaForLimit(query.data.limit).safeParse(
    page.items.map((item) => item.value),
  );
  if (!responseItems.success) {
    console.error("search/users: invalid public response", responseItems.error);
    return apiError("Search failed", 500, "SEARCH_FAILED");
  }
  return NextResponse.json(responseItems.data, {
    headers: {
      "x-api-version": API_VERSION,
      "x-next-cursor": page.next_cursor ?? "",
      "x-has-more": String(page.has_more),
    },
  });
});
