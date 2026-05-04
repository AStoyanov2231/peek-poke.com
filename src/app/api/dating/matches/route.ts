import { NextResponse } from "next/server"
import { withAuth } from "@/lib/auth"
import { apiError } from "@/lib/api-error"
import type { MatchWithPartner } from "@/types/database"

export const GET = withAuth(async (_request, { user, supabase }) => {
  const { data, error } = await supabase.rpc("get_active_matches", {
    p_user_id: user.id,
  })

  if (error) return apiError("Failed to fetch matches", 500, "MATCHES_FETCH_FAILED")

  const rows = data as Array<{
    id: string
    thread_id: string | null
    matched_at: string
    expires_at: string
    partner_id: string
    partner_username: string
    partner_display_name: string | null
    partner_avatar_url: string | null
  }>

  const matches: MatchWithPartner[] = (rows ?? []).map((row) => ({
    id: row.id,
    thread_id: row.thread_id,
    matched_at: row.matched_at,
    expires_at: row.expires_at,
    partner: {
      id: row.partner_id,
      username: row.partner_username,
      display_name: row.partner_display_name,
      avatar_url: row.partner_avatar_url,
    },
  }))

  return NextResponse.json({ matches })
})
