import { NextResponse } from "next/server";
import {
  ageAdmissionRequestSchema,
  ageAdmissionSchema,
} from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validators";
import {
  isAdultBirthDate,
  recordAccountAgeAdmission,
} from "@/features/age-admission/server/age-admission";

function unavailable() {
  const response = apiError(
    "Age admission is temporarily unavailable",
    503,
    "AGE_ADMISSION_UNAVAILABLE",
  );
  response.headers.set("retry-after", "5");
  return response;
}

export const GET = withAuth(async (_request, { ageAdmission }) =>
  NextResponse.json(ageAdmissionSchema.parse(ageAdmission), {
    headers: { "cache-control": "no-store" },
  }),
{ allowPendingAgeAdmission: true });

export const POST = withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("ageAdmission", user.id);
  if (limited) return limited;
  const [body, bodyError] = await parseBody(request, ageAdmissionRequestSchema);
  if (bodyError) return apiError("Enter a valid birth date", 400, "INVALID_BIRTH_DATE");

  // The raw declaration is request-local only. It is converted to a boolean
  // before the service RPC and is never logged or returned.
  const isAdult = isAdultBirthDate(body.birth_date);
  if (isAdult === null)
    return apiError("Enter a valid birth date", 400, "INVALID_BIRTH_DATE");
  const result = await recordAccountAgeAdmission(user.id, isAdult);
  if (result.unavailable) return unavailable();
  return NextResponse.json(ageAdmissionSchema.parse(result.data), {
    headers: { "cache-control": "no-store" },
  });
}, { allowPendingAgeAdmission: true });
