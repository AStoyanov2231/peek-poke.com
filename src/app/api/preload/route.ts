import { NextResponse } from "next/server";
import { getBlockedPeerIds, withAuth } from "@/lib/auth";
import type { PreloadResponse } from "@peekpoke/shared";
import { signPrivateProfilePhotos } from "@/lib/storage-urls";
import { createServiceClient } from "@/lib/supabase/server";
import { stripPrivateProfileFields } from "@/lib/client-data";
import { filterBlockedPreload } from "@/lib/blocked-data";
import { apiError } from "@/lib/api-error";

export const GET = withAuth(async (_request, { user, supabase }) => {
  const serviceClient = createServiceClient();
  const [preloadResult, coinsResult, blockedPeerIds] = await Promise.all([
    serviceClient.rpc("get_preload", { p_user_id: user.id }),
    serviceClient.rpc("get_user_coins_data", { p_user_id: user.id }),
    getBlockedPeerIds(user.id),
  ]);

  if (preloadResult.error) {
    console.error("Preload error:", preloadResult.error);
    return apiError("Failed to preload data", 500, "PRELOAD_FAILED");
  }

  if (preloadResult.data?.error) {
    return apiError("Failed to preload data", 500, "PRELOAD_FAILED");
  }

  // Merge coins data into preload response
  const profileData = preloadResult.data?.profile;
  const { data: photoRows, error: photoError } = await serviceClient
    .from("profile_photos")
    .select("*")
    .eq("user_id", user.id)
    .order("display_order", { ascending: true });
  if (photoError) {
    console.error("Preload photos error:", photoError);
    return apiError("Failed to preload data", 500, "PRELOAD_FAILED");
  }
  const signedPhotos = await signPrivateProfilePhotos(serviceClient, photoRows ?? []);
  const data = {
    ...preloadResult.data,
    profile: profileData ? { ...profileData, photos: signedPhotos } : profileData,
    coins: coinsResult.data ?? { balance: 5, metFriendIds: [] },
  };

  return NextResponse.json(stripPrivateProfileFields(
    filterBlockedPreload(data as PreloadResponse, blockedPeerIds)
  ));
});
