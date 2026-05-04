import { NextResponse } from "next/server"
import { withAuth } from "@/lib/auth"
import { parseBody, passSchema } from "@/lib/validators"
import { apiError } from "@/lib/api-error"

export const POST = withAuth(async (request, { user, supabase }) => {
  const [body, err] = await parseBody(request, passSchema)
  if (err) return err

  const { data, error } = await supabase.rpc("send_pass", {
    p_passer_id: user.id,
    p_passee_id: body.passee_id,
  })

  if (error) return apiError("Failed to record pass", 500, "PASS_FAILED")

  const rpcData = data as {
    error?: string
    status?: number
    passed?: boolean
    passes_remaining?: number | null
  }

  if (rpcData.error) {
    return NextResponse.json(
      { error: rpcData.error, code: rpcData.error },
      { status: rpcData.status ?? 400 }
    )
  }

  return NextResponse.json({
    passed: true,
    dailyPassesRemaining: rpcData.passes_remaining ?? null,
  })
})
