import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";
import { randomBytes } from "crypto";

// GET — return existing key (masked) or null
export const GET = withAuth(async (_request, { user }) => {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("gpt_api_keys")
    .select("id, created_at, last_used_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ exists: !!data, key: null, meta: data ?? null });
});

// POST — generate (or regenerate) an API key, returning it once in plaintext
export const POST = withAuth(async (_request, { user }) => {
  const supabase = createServiceClient();

  const key = `pp_${randomBytes(32).toString("base64url")}`;

  // Upsert: one key per user
  const { error } = await supabase
    .from("gpt_api_keys")
    .upsert({ user_id: user.id, key }, { onConflict: "user_id" });

  if (error) {
    console.error("gpt/key POST:", error);
    return apiError("Failed to generate key", 500, "KEY_GEN_FAILED");
  }

  return NextResponse.json({ key });
});
