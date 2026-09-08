import { NextResponse } from "next/server";
import { withNoStore } from "@/lib/no-store-response";
import { createServiceClient } from "@/lib/supabase/server";
import { isOutboxRequestAuthorized } from "@/server/outbox/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = withNoStore(async (request: Request) => {
  if (!isOutboxRequestAuthorized(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
  )) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await createServiceClient().rpc("purge_stale_user_locations", {
    p_batch_size: 1000,
  });
  if (error || !Number.isInteger(data) || data < 0 || data > 1000) {
    console.error("privacy cleanup:", error ?? "invalid purge response");
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }

  return NextResponse.json({ deleted: data });
});
