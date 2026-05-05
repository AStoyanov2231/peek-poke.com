import type { SupabaseClient } from "@supabase/supabase-js";
import type { PreloadResponse } from "@/stores/appStore";

export async function getPreloadData(
  supabase: SupabaseClient,
  userId: string
): Promise<PreloadResponse | null> {
  const [preloadResult, coinsResult] = await Promise.all([
    supabase.rpc("get_preload", { p_user_id: userId }),
    supabase.rpc("get_user_coins_data", { p_user_id: userId }),
  ]);

  if (preloadResult.error || preloadResult.data?.error) return null;

  return {
    ...preloadResult.data,
    coins: coinsResult.data ?? { balance: 5, metFriendIds: [] },
  };
}
