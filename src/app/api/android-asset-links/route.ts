import { NextResponse } from "next/server";
import { withRequestContext } from "@/lib/request-context";

const SHA256_FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export const GET = withRequestContext(async () => {
  const fingerprints = (process.env.ANDROID_APP_CERT_SHA256 ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => SHA256_FINGERPRINT.test(value));

  if (!fingerprints.length) {
    return NextResponse.json(
      { error: "Android app links are not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.peekpoke.app",
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
});
