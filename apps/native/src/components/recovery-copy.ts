type RecoverableFailure = {
  code?: unknown;
  digest?: unknown;
  status?: unknown;
};

export type RecoveryContent = {
  title: string;
  message: string;
};

export type RecoveryAction = {
  kind: "retry" | "reauthenticate";
  label: "Try again" | "Sign in again";
};

function failureDetails(error: unknown): RecoverableFailure {
  return typeof error === "object" && error !== null ? error : {};
}

export function getRecoveryContent(
  error: unknown,
  title = "Something went wrong"
): RecoveryContent {
  const details = failureDetails(error);
  const hasStatus = details.status !== undefined && details.status !== null;
  const status = hasStatus ? Number(details.status) : null;

  if (details.code === "NETWORK_UNAVAILABLE" || status === 0) {
    return {
      title: title === "Something went wrong" ? "You're offline" : title,
      message: "Check your connection and try again.",
    };
  }

  if (status === 401) {
    return {
      title: "Session expired",
      message: "Sign in again to continue.",
    };
  }

  if (status === 403) {
    return {
      title,
      message: "You don't have access to this content.",
    };
  }

  if (status !== null && status >= 500) {
    return {
      title: title === "Something went wrong" ? "Service temporarily unavailable" : title,
      message: "We couldn't reach Peek & Poke. Try again in a moment.",
    };
  }

  return {
    title,
    message: typeof details.digest === "string"
      ? `Error ID: ${details.digest}`
      : "An unexpected error occurred.",
  };
}

export function getRecoveryAction(error: unknown): RecoveryAction {
  const details = failureDetails(error);
  return Number(details.status) === 401
    ? { kind: "reauthenticate", label: "Sign in again" }
    : { kind: "retry", label: "Try again" };
}
