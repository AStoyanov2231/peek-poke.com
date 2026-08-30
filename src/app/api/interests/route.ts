import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { withRequestContext } from "@/lib/request-context";
import { apiError } from "@/lib/api-error";
import { interestCatalogResponseSchema } from "@peekpoke/shared";

const INTEREST_COLUMNS = "id, name, category, icon, display_order";

export const revalidate = 3600;

export const GET = withRequestContext(async () => {
  const supabase = createServiceClient();

  const { data: tags, error } = await supabase
    .from("interest_tags")
    .select(INTEREST_COLUMNS)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("interests:", error);
    return apiError("Internal server error", 500, "INTERESTS_FETCH_FAILED");
  }

  return NextResponse.json(
    interestCatalogResponseSchema.parse({ tags: tags ?? [] }),
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
});
