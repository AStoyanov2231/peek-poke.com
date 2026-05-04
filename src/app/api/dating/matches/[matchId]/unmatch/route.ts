import { NextResponse } from "next/server"
import { withAuth } from "@/lib/auth"
import { apiError } from "@/lib/api-error"

export const POST = withAuth<{ matchId: string }>(async (_request, { user, supabase, params }) => {
  const { matchId } = params

  const { data, error } = await supabase.rpc("unmatch", {
    p_match_id: matchId,
    p_user_id: user.id,
  })

  if (error) return apiError("Failed to unmatch", 500, "UNMATCH_FAILED")

  const result = data as { error?: string; status?: number; success?: boolean }
  if (result.error) {
    return NextResponse.json(
      { error: result.error, code: result.error },
      { status: result.status ?? 400 }
    )
  }

  return NextResponse.json({ success: true })
})
