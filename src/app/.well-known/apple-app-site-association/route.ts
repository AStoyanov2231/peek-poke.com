import { NextResponse } from "next/server";

// AASA for Universal Links. App ID = <TeamID>.<BundleID>.
// Update TEAM_ID with your Apple Developer Team ID before App Store submission.
const TEAM_ID = process.env.APPLE_TEAM_ID ?? "XXXXXXXXXX";
const BUNDLE_ID = "com.peekpoke.app";

const aasa = {
  applinks: {
    apps: [],
    details: [
      {
        appID: `${TEAM_ID}.${BUNDLE_ID}`,
        paths: [
          "/profile/*",
          "/chat/*",
          "/inbox",
          "/",
        ],
      },
    ],
  },
};

export function GET() {
  return new NextResponse(JSON.stringify(aasa), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
