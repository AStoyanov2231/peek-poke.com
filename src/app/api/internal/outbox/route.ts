import { NextResponse } from "next/server";
import { isOutboxRequestAuthorized } from "@/server/outbox/auth";
import { processOutboxBatch } from "@/server/outbox/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isOutboxRequestAuthorized(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
  )) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await processOutboxBatch(25));
  } catch (error) {
    console.error("outbox worker:", error);
    return NextResponse.json({ error: "Worker failed" }, { status: 500 });
  }
}
