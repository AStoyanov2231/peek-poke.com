import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

type GptAuthOk = { userId: string };
type GptAuthResult = GptAuthOk | NextResponse;

export function isGptAuthError(result: GptAuthResult): result is NextResponse {
  return result instanceof NextResponse;
}

export async function withGptAuth(request: Request): Promise<GptAuthResult> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = authHeader.slice(7);
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("gpt_api_keys")
    .select("user_id")
    .eq("key", key)
    .single();

  if (!data) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  void supabase
    .from("gpt_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key", key);

  return { userId: data.user_id };
}
