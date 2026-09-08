import type { AgeAdmission } from "@peekpoke/shared";

export function requiresAgeAdmissionRoute(
  pathname: string,
  admission: AgeAdmission | null,
  isValidatedPublicPlanPreview = false,
) {
  if (!admission || admission.status === "adult") return false;
  return !isValidatedPublicPlanPreview
    && !["/age-admission", "/auth/callback", "/auth/reset-password"].includes(pathname);
}

export function ageAdmissionReturnIntent(
  pendingInvite?: string,
  pendingPlanToken?: string,
) {
  return {
    ...(pendingInvite ? { invite: pendingInvite } : {}),
    ...(pendingPlanToken ? { plan_token: pendingPlanToken } : {}),
  };
}

export function canStartAgeRestrictedServices({
  admission,
  candidateUserId,
  currentBootstrapUserId,
  latestBootstrap,
}: {
  admission: AgeAdmission | null;
  candidateUserId: string;
  currentBootstrapUserId: string | null;
  latestBootstrap: boolean;
}) {
  return admission?.status === "adult"
    && currentBootstrapUserId === candidateUserId
    && latestBootstrap;
}

export function canRefreshAdultRealtimeSession(admission: AgeAdmission | null) {
  return admission?.status === "adult";
}

export function publicPlanJoinDestination({
  token,
  hasSession,
  admission,
}: {
  token: string;
  hasSession: boolean;
  admission: AgeAdmission | null;
}) {
  if (!hasSession) return { pathname: "/(auth)/login", params: { plan_token: token } } as const;
  if (admission?.status !== "adult") return { pathname: "/age-admission", params: { plan_token: token } } as const;
  return null;
}
