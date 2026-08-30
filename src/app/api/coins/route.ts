import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { coinsResponseSchema } from "@peekpoke/shared";

export const GET = withAuth(async (_request, { user, supabase }) => {
  const { data, error } = await supabase
    .from("user_coins")
    .select("balance")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("coins:", error);
    return apiError("Failed to fetch balance", 500, "BALANCE_FETCH_FAILED");
  }

  const response = coinsResponseSchema.safeParse(data);
  if (!response.success) {
    console.error("coins: invalid response", response.error);
    return apiError("Failed to fetch balance", 500, "BALANCE_FETCH_FAILED");
  }

  return NextResponse.json(response.data);
});
