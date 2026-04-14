import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

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

  return NextResponse.json({ balance: data.balance });
});
