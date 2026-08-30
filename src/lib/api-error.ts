import { NextResponse } from "next/server";
import { apiErrorEnvelope } from "@peekpoke/shared/errors";
import { currentRequestId } from "@/lib/request-context";

export function apiError(
  message: string,
  status: number,
  code?: string
): NextResponse {
  return NextResponse.json(
    apiErrorEnvelope(message, code ?? "INTERNAL_ERROR", currentRequestId() ?? null),
    { status }
  );
}
