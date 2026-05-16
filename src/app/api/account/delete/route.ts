import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

// Any client calling this endpoint must also call PeekPokeBridge.clearAuth() on native
// to wipe Keychain tokens before the server-side signOut fires, preventing Keychain
// tokens from being reposted to /auth/native-handoff after account deletion.
export const POST = withAuth(async (_request, { user, supabase }) => {
  const serviceClient = createServiceClient();

  const { error } = await serviceClient
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    console.error("account/delete:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await supabase.auth.signOut();

  return NextResponse.json({ success: true });
});
