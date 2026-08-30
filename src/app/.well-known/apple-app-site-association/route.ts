import { NextResponse } from "next/server";

const TEAM_ID = process.env.APPLE_TEAM_ID ?? "GNCXNSU2H8";
const BUNDLE_ID = "com.peekpoke.app";
const TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;

export function GET() {
  if (!TEAM_ID_PATTERN.test(TEAM_ID)) {
    return NextResponse.json(
      { error: "Apple app links are not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs: [`${TEAM_ID}.${BUNDLE_ID}`],
            components: [{ "/": "/invite/*" }],
          },
        ],
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
