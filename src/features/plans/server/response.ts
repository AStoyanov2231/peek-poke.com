import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import type { PlanRpcFailure } from "./plans";

export function planFailure(failure: PlanRpcFailure) {
  switch (failure) {
    case "NOT_FOUND":
    case "BLOCKED":
      return apiError("Plan not found", 404, "PLAN_NOT_FOUND");
    case "FORBIDDEN":
      return apiError("You cannot access this plan", 403, "PLAN_FORBIDDEN");
    case "FULL":
      return apiError("This plan is full", 409, "PLAN_FULL");
    case "CANCELLED":
      return apiError("This plan has been cancelled", 409, "PLAN_CANCELLED");
    case "EXPIRED":
      return apiError("This plan has already started", 410, "PLAN_EXPIRED");
    case "MEETUP_NOT_READY":
      return apiError("Meetup confirmation opens when this plan starts", 409, "PLAN_MEETUP_NOT_READY");
    case "MEETUP_CLOSED":
      return apiError("The confirmation window for this plan has closed", 410, "PLAN_MEETUP_CLOSED");
    case "LOCATION_REQUIRED":
      return apiError("Refresh your location to show this Plan nearby, or create it without nearby discovery.", 400, "LOCATION_REQUIRED");
    case "IDEMPOTENCY_CONFLICT":
      return apiError(
        "Idempotency key was already used for another request",
        409,
        "IDEMPOTENCY_CONFLICT",
      );
    default:
      return apiError(
        "Plan request could not be completed",
        500,
        "PLAN_OPERATION_FAILED",
      );
  }
}

export function planUnavailable() {
  const response = apiError(
    "Plans are temporarily unavailable",
    503,
    "PLANS_UNAVAILABLE",
  );
  response.headers.set("retry-after", "5");
  return response;
}

export function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("cache-control", "no-store");
  return response;
}
