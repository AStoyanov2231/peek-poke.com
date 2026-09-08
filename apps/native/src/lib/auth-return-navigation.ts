import type { Bootstrap } from "@peekpoke/shared";
import { ageAdmissionReturnIntent } from "@/lib/age-admission-navigation";
import { nativeAuthenticatedHomeRoute } from "@/lib/navigation-policy";

type AuthReturnBootstrap = Pick<Bootstrap, "age_admission" | "onboarding_completed">;

export function isPublicPlanPreviewPath(pathname: string) {
  return /^\/plan\/[A-Za-z0-9_-]{43}$/.test(pathname);
}

export function loginRouteForPendingIntent(pendingInvite?: string, pendingPlanToken?: string) {
  return {
    pathname: "/(auth)/login",
    params: {
      ...(pendingInvite ? { invite: pendingInvite } : {}),
      ...(pendingPlanToken ? { plan_token: pendingPlanToken } : {}),
    },
  } as const;
}

export function routeAfterBootstrap(
  data: AuthReturnBootstrap,
  pendingInvite?: string,
  pendingPlanToken?: string,
) {
  if (data.age_admission.status !== "adult") {
    return {
      pathname: "/age-admission",
      params: ageAdmissionReturnIntent(pendingInvite, pendingPlanToken),
    } as const;
  }
  if (!data.onboarding_completed) {
    return {
      pathname: "/onboarding",
      params: {
        ...(pendingInvite ? { invite: pendingInvite } : {}),
        ...(pendingPlanToken ? { plan_token: pendingPlanToken } : {}),
      },
    } as const;
  }
  if (pendingInvite) return `/invite/${pendingInvite}` as const;
  if (pendingPlanToken) return `/plan/${pendingPlanToken}` as const;
  return nativeAuthenticatedHomeRoute;
}
