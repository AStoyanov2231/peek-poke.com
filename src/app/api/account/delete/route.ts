import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

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
