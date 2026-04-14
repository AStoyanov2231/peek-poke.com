import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async (_request, { user, supabase }) => {
  const [preloadResult, coinsResult] = await Promise.all([
    supabase.rpc("get_preload", { p_user_id: user.id }),
    supabase.rpc("get_user_coins_data", { p_user_id: user.id }),
  ]);

  if (preloadResult.error) {
    console.error("Preload error:", preloadResult.error);
    return NextResponse.json({ error: "Failed to preload data" }, { status: 500 });
  }

  if (preloadResult.data?.error) {
    return NextResponse.json({ error: preloadResult.data.error }, { status: 500 });
  }

  // Merge coins data into preload response
  const data = {
    ...preloadResult.data,
    coins: coinsResult.data ?? { balance: 5, metFriendIds: [] },
  };

  return NextResponse.json(data);
});
