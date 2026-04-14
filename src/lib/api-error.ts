import { NextResponse } from "next/server";

export function apiError(
  message: string,
  status: number,
  code?: string
): NextResponse {
  return NextResponse.json(
    { error: message, ...(code && { code }) },
    { status }
  );
}
