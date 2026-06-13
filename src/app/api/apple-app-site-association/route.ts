import { NextResponse } from "next/server";

/**
 * Apple App Site Association — served at /.well-known/apple-app-site-association
 * (rewrite in next.config.ts). Lets iOS open /invite/* links directly in the
 * native app (associated-domains entitlement in ios/App/App/App.entitlements).
 */
export function GET() {
  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs: ["GNCXNSU2H8.com.peekpoke.app"],
            components: [{ "/": "/invite/*" }],
          },
        ],
      },
    },
    {
      headers: {
        "cache-control": "public, max-age=3600",
      },
    }
  );
}
