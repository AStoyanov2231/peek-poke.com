import { isSafeInternalRedirect } from "@/lib/internal-redirect";

/** Preserve a safe deep link through age admission without allowing gate loops. */
export function afterAgeAdmissionPath(value: unknown): string {
  if (!isSafeInternalRedirect(value)) return "/now";
  const pathname = value.split("?")[0];
  return ["/login", "/welcome", "/age-gate", "/onboarding", "/auth/callback"].includes(pathname)
    || pathname.startsWith("/api/")
    ? "/now"
    : value;
}

export function ageAdmissionRedirect(value: unknown): string {
  const params = new URLSearchParams({ redirectTo: afterAgeAdmissionPath(value) });
  const invite = afterAgeAdmissionPath(value).match(/^\/invite\/([a-zA-Z0-9-]+)$/);
  if (invite) params.set("invite", invite[1]);
  return `/age-gate?${params.toString()}`;
}
