import { NextResponse, type NextRequest } from "next/server";

/**
 * OAuth landing page for the NATIVE app. The provider flow runs in the system
 * browser (SFSafariViewController), which can't hand cookies to the app — so
 * this page bounces the PKCE auth code back into the app via the peekpoke://
 * scheme. The WebView's Supabase client (which holds the code verifier)
 * exchanges it for a session in NativeBridgeProvider.
 */

function isValidNextPath(path: string | null): path is string {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("://")
  );
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const next = params.get("next");

  const target = new URL("peekpoke://oauth-callback");
  if (code) {
    target.searchParams.set("code", code);
    if (isValidNextPath(next)) target.searchParams.set("next", next);
  } else {
    target.searchParams.set(
      "error",
      params.get("error_description") ?? "Sign-in was cancelled."
    );
  }

  // An HTML page (not a 302): Safari may suppress silent redirects to custom
  // schemes, so a visible tap target is the reliable fallback.
  const href = escapeHtml(target.toString());
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0;url=${href}">
  <title>Returning to Peek &amp; Poke…</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 90vh; gap: 16px; text-align: center; padding: 0 24px; }
    a { display: inline-block; padding: 14px 28px; border-radius: 9999px; background: #18181b; color: #fff; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <p>Sign-in complete.</p>
  <a href="${href}">Return to Peek &amp; Poke</a>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
