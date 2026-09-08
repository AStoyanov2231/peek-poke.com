import { isSafeInternalRedirect } from "@/lib/internal-redirect";
/** Preserve a preview through account setup, without allowing auth loops or external destinations. */
export function afterOnboardingPath(value: unknown): string {
  if (!isSafeInternalRedirect(value)) return "/now";
  const pathname = value.split("?")[0];
  return ["/login", "/welcome", "/onboarding", "/auth/callback"].includes(
    pathname,
  ) || pathname.startsWith("/api/")
    ? "/now"
    : value;
}
export function onboardingRedirect(value: unknown): string {
  const destination = afterOnboardingPath(value);
  const params = new URLSearchParams({ redirectTo: destination });
  const invite = destination.match(/^\/invite\/([a-zA-Z0-9-]+)$/);
  if (invite) params.set("invite", invite[1]);
  return `/onboarding?${params.toString()}`;
}
