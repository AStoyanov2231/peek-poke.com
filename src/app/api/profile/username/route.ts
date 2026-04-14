import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { usernameSchema, parseBody } from "@/lib/validators";

export const PATCH = withAuth(async (request, { user, supabase }) => {
  const [data, err] = await parseBody(request, usernameSchema);
  if (err) return err;

  const trimmedUsername = data.username.trim().toLowerCase();

  // Update username - database constraint will handle uniqueness
  const { data: profile, error } = await supabase
    .from("profiles")
    .update({ username: trimmedUsername })
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    // Handle unique constraint violation
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 409 }
      );
    }
    console.error("profile/username:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ profile });
});
