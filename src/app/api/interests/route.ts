import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data: tags, error } = await supabase
    .from("interest_tags")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) {
    console.error("interests:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ tags });
}
