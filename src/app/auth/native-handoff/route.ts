import { createServiceClient } from "@/lib/supabase/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function isValidInternalPath(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("://") &&
    !path.startsWith("/api/")
  );
}

/**
 * Native cold-launch auth handoff.
 *
 * The native shell posts this with its Keychain tokens so the WebView's
 * WKHTTPCookieStore gets Supabase session cookies minted via Set-Cookie headers.
 * After this request, every subsequent page load is authenticated by cookies
 * without the user ever seeing /login.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = body as {
    accessToken?: unknown;
    refreshToken?: unknown;
    next?: unknown;
  };
  const accessToken = typeof payload.accessToken === "string" ? payload.accessToken : null;
  const refreshToken = typeof payload.refreshToken === "string" ? payload.refreshToken : null;
  const nextParam = typeof payload.next === "string" ? payload.next : "/";
  const next = isValidInternalPath(nextParam) ? nextParam : "/";

  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: "Missing tokens" }, { status: 401 });
  }

  // Validate the access token is real before minting cookies
  const serviceClient = createServiceClient();
  const { data: { user }, error: userError } = await serviceClient.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Build SSR client backed by cookies so setSession writes Set-Cookie headers
  const cookieStore = await cookies();
  const responseCookies: CookieToSet[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          responseCookies.push(...cookiesToSet);
        },
      },
    }
  );

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nextUrl = new URL(next, origin);
  const response = NextResponse.json({ next: nextUrl.pathname + nextUrl.search });
  responseCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/login", request.url));
}
