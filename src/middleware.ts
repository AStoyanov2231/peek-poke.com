import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function isValidInternalPath(path: string): boolean {
  // Must start with / and not contain protocol indicators or double slashes
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("://") && !path.startsWith("/api/");
}

export async function middleware(request: NextRequest) {
  // CSRF protection for API mutation requests
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
      // Webhook uses signature verification, not CSRF
      if (request.nextUrl.pathname !== "/api/stripe/webhook") {
        const authHeader = request.headers.get("authorization");
        const isNativeApp = authHeader?.startsWith("Bearer ");
        // Native apps authenticate via Bearer token, not cookies — skip Origin check
        if (!isNativeApp) {
          const origin = request.headers.get("origin");
          const host = request.headers.get("host");
          if (!origin || new URL(origin).host !== host) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
        }
      }
    }
    return NextResponse.next();
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

  const { data: { user } } = await supabase.auth.getUser();

  const isAuthPage = request.nextUrl.pathname.startsWith("/login") ||
                     request.nextUrl.pathname.startsWith("/welcome");
  const isOnboardingPage = request.nextUrl.pathname === "/onboarding";

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
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    // Check onboarding for non-auth, non-onboarding pages
    if (!isOnboardingPage && !onboardingComplete) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    // Redirect away from onboarding if already complete
    if (isOnboardingPage && onboardingComplete) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|auth/callback|auth/native-handoff|models/|images/).*)"],
};
