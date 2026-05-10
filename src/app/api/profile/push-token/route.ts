import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
});

// Requires push_tokens jsonb column on profiles:
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_tokens jsonb NOT NULL DEFAULT '[]'::jsonb;
export const POST = withAuth(async (request, { user, supabase }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON", 400, "INVALID_BODY");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid request body", 400, "VALIDATION_ERROR");
  }

  const { token, platform } = parsed.data;

  // Fetch current tokens, dedup, and upsert
  const { data: profile, error: fetchError } = await supabase
    .from("profiles")
    .select("push_tokens")
    .eq("id", user.id)
    .single();

  if (fetchError) {
    return apiError("Internal server error", 500, "PROFILE_FETCH_FAILED");
  }

  const existing: { token: string; platform: string }[] = profile?.push_tokens ?? [];
  const filtered = existing.filter((t) => t.token !== token);
  const updated = [{ token, platform }, ...filtered].slice(0, 20);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ push_tokens: updated })
    .eq("id", user.id);

  if (updateError) {
    return apiError("Internal server error", 500, "PUSH_TOKEN_UPDATE_FAILED");
  }

  return NextResponse.json({ ok: true });
});
