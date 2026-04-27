import { NextResponse } from "next/server"
import { withAuth } from "@/lib/auth"
import { parseBody, pokeSchema } from "@/lib/validators"
import { apiError } from "@/lib/api-error"
import { SUPER_POKE_COST_COINS } from "@/lib/constants"

export const POST = withAuth(async (request, { user, supabase }) => {
  const [body, err] = await parseBody(request, pokeSchema)
  if (err) return err

  let preDeductBalance: number | null = null

  if (body.is_super) {
    // Read current balance
    const { data: coinData, error: balanceError } = await supabase
      .from("user_coins")
      .select("balance")
      .eq("user_id", user.id)
      .single()

    if (balanceError || !coinData) {
      return apiError("Failed to check coin balance", 500, "COIN_CHECK_FAILED")
    }

    if (coinData.balance < SUPER_POKE_COST_COINS) {
      return NextResponse.json(
        { error: "Insufficient coins", code: "INSUFFICIENT_COINS", required: SUPER_POKE_COST_COINS },
        { status: 402 }
      )
    }

    // Optimistic-lock update: only succeeds if balance hasn't changed since read
    const { data: updated, error: deductError } = await supabase
      .from("user_coins")
      .update({ balance: coinData.balance - SUPER_POKE_COST_COINS })
      .eq("user_id", user.id)
      .eq("balance", coinData.balance)
      .select()

    if (deductError || !updated || updated.length === 0) {
      return NextResponse.json(
        { error: "Coin balance changed, please retry", code: "COIN_RACE" },
        { status: 409 }
      )
    }

    preDeductBalance = coinData.balance

    await supabase.from("coin_transactions").insert({
      user_id: user.id,
      amount: -SUPER_POKE_COST_COINS,
      reason: "super_poke",
      related_user_id: body.pokee_id,
    })
  }

  const { data, error } = await supabase.rpc("send_poke", {
    p_poker_id: user.id,
    p_pokee_id: body.pokee_id,
    p_is_super: body.is_super,
  })

  if (error) return apiError("Failed to send poke", 500, "POKE_FAILED")

  const rpcData = data as {
    error?: string
    status?: number
    poked?: boolean
    match?: object | null
    pokes_remaining?: number | null
  }

  if (rpcData.error) {
    // Best-effort refund for failed super-poke (coins were already deducted)
    if (body.is_super && preDeductBalance !== null) {
      await supabase
        .from("user_coins")
        .update({ balance: preDeductBalance })
        .eq("user_id", user.id)
    }
    return NextResponse.json(
      { error: rpcData.error, code: rpcData.error },
      { status: rpcData.status ?? 400 }
    )
  }

  return NextResponse.json({
    poked: true,
    match: rpcData.match ?? null,
    dailyPokesRemaining: rpcData.pokes_remaining ?? null,
  })
})
