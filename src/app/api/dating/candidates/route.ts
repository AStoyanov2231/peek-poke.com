import { NextResponse } from "next/server"
import { withAuth } from "@/lib/auth"
import { apiError } from "@/lib/api-error"
import { FREE_DAILY_POKES, FREE_DAILY_PASSES } from "@/lib/constants"

export const GET = withAuth(async (request, { user, supabase }) => {
  const { searchParams } = new URL(request.url)
  const latStr = searchParams.get("lat")
  const lngStr = searchParams.get("lng")
  const limitStr = searchParams.get("limit") ?? "20"

  if (!latStr || !lngStr) {
    return apiError("Location required", 400, "MISSING_LOCATION")
  }

  const lat = parseFloat(latStr)
  const lng = parseFloat(lngStr)
  const limit = Math.min(parseInt(limitStr, 10) || 20, 50)

  if (isNaN(lat) || isNaN(lng)) {
    return apiError("Invalid location coordinates", 400, "INVALID_LOCATION")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("dating_onboarding_completed, roles")
    .eq("id", user.id)
    .single()

  if (!profile?.dating_onboarding_completed) {
    return apiError("Dating onboarding incomplete", 403, "ONBOARDING_INCOMPLETE")
  }

  const { data, error } = await supabase.rpc("get_match_candidates", {
    p_viewer_id: user.id,
    p_lat: lat,
    p_lng: lng,
    p_limit: limit,
  })

  if (error) return apiError("Failed to fetch candidates", 500, "CANDIDATES_FAILED")

  const rpcResult = data as { error?: string; candidates?: unknown[] }

  if (rpcResult.error) {
    return apiError(`Candidate fetch error: ${rpcResult.error}`, 500, "CANDIDATES_FAILED")
  }

  const today = new Date().toISOString().split("T")[0]
  const { data: counter } = await supabase
    .from("daily_action_counters")
    .select("pokes_sent, passes_sent")
    .eq("user_id", user.id)
    .eq("action_date", today)
    .single()

  // profile.roles is RoleName[] (string array)
  const isSubscriber = (profile.roles as string[] | null)?.includes("subscriber") ?? false

  const pokesSent = counter?.pokes_sent ?? 0
  const passesSent = counter?.passes_sent ?? 0

  return NextResponse.json({
    candidates: rpcResult.candidates ?? [],
    dailyPokesRemaining: isSubscriber ? null : Math.max(0, FREE_DAILY_POKES - pokesSent),
    dailyPassesRemaining: isSubscriber ? null : Math.max(0, FREE_DAILY_PASSES - passesSent),
  })
})
