import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSafeInternalRedirect } from "@/lib/internal-redirect";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const CSRF_EXEMPT_API_PATHS = new Set([
  "/api/stripe/webhook",
]);

function isValidInternalPath(path: string): boolean {
  return isSafeInternalRedirect(path) && !path.startsWith("/api/");
}

function onboardingUrlFor(request: NextRequest) {
  const url = new URL("/onboarding", request.url);
  const inviteMatch = request.nextUrl.pathname.match(/^\/invite\/([a-zA-Z0-9-]+)$/);
  if (inviteMatch) url.searchParams.set("invite", inviteMatch[1]);
  return url;
}

function hasMatchingOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApiRequest = pathname.startsWith("/api/");
  const isCsrfExempt = CSRF_EXEMPT_API_PATHS.has(pathname);
  const authHeader = request.headers.get("authorization");
  const isBearerClient = authHeader?.startsWith("Bearer ") ?? false;

  // CSRF protection for API mutation requests
  if (isApiRequest) {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
      // Stripe webhook uses signature verification.
      if (!isCsrfExempt) {
        // Native apps authenticate via Bearer token, not cookies — skip Origin check
        if (!isBearerClient && !hasMatchingOrigin(request)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    // Bearer clients and signed webhooks have no browser session to refresh.
    // Cookie-authenticated web API requests
    // continue through the SSR client below so refreshed cookies reach routes.
    if (isBearerClient || isCsrfExempt) return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  if (isApiRequest) return response;

  const { data: { user } } = await supabase.auth.getUser();

  const isAuthPage = request.nextUrl.pathname.startsWith("/login") ||
                     request.nextUrl.pathname.startsWith("/welcome");
  const isOnboardingPage = request.nextUrl.pathname === "/onboarding";
  const isPasswordRecoveryPage = request.nextUrl.pathname === "/reset-password";

  // Unauthenticated users must go to auth pages
  if (!user && !isAuthPage) {
    const redirectUrl = new URL("/login", request.url);
    // Preserve the original path so user can be redirected after auth
    const originalPath = request.nextUrl.pathname;
    if (isValidInternalPath(originalPath)) {
      redirectUrl.searchParams.set("redirectTo", originalPath);
    }
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated users
  if (user) {
    const hasFastPathCookie = request.cookies.get("pp_onboarded")?.value === "1";

    let onboardingComplete: boolean;

    if (hasFastPathCookie) {
      // Fast path: onboarding is known complete via cookie, but always enforce deleted_at
      const { data: profile } = await supabase
        .from("profiles")
        .select("deleted_at")
        .eq("id", user.id)
        .single();

      if (profile?.deleted_at) {
        await supabase.auth.signOut();
        const loginResponse = NextResponse.redirect(new URL("/login", request.url));
        loginResponse.cookies.delete("pp_onboarded");
        return loginResponse;
      }
      onboardingComplete = true;
    } else {
      // No fast-path cookie: query DB for both onboarding status and deleted_at
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed, deleted_at")
        .eq("id", user.id)
        .single();

      onboardingComplete = profile?.onboarding_completed ?? false;

      if (profile?.deleted_at) {
        await supabase.auth.signOut();
        const loginResponse = NextResponse.redirect(new URL("/login", request.url));
        loginResponse.cookies.delete("pp_onboarded");
        return loginResponse;
      }
    }

    // Redirect auth pages to home (or onboarding if incomplete)
    if (isAuthPage) {
      if (!onboardingComplete) {
        return NextResponse.redirect(new URL("/onboarding", request.url));
      }
      return NextResponse.redirect(new URL("/", request.url));
    }

    // "/" with incomplete onboarding → redirect to onboarding
    if (request.nextUrl.pathname === "/" && !onboardingComplete) {
      return NextResponse.redirect(onboardingUrlFor(request));
    }

    // Check onboarding for non-auth, non-onboarding pages
    if (!isOnboardingPage && !isPasswordRecoveryPage && !onboardingComplete) {
      return NextResponse.redirect(onboardingUrlFor(request));
    }

    // Redirect away from onboarding if already complete
    if (isOnboardingPage && onboardingComplete) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|auth/callback|\.well-known/|models/|images/).*)"],
};
