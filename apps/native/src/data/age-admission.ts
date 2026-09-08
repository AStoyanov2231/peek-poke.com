import {
  ageAdmissionRequestSchema,
  ageAdmissionSchema,
  type AgeAdmission,
} from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";

export function fetchAgeAdmission(signal?: AbortSignal): Promise<AgeAdmission> {
  return apiFetch("/api/age-admission", {
    signal,
    responseSchema: ageAdmissionSchema,
  });
}

export function submitAgeAdmission(birthDate: string, signal?: AbortSignal): Promise<AgeAdmission> {
  const body = ageAdmissionRequestSchema.parse({ birth_date: birthDate });
  return apiFetch("/api/age-admission", {
    method: "POST",
    body: jsonBody(body),
    signal,
    responseSchema: ageAdmissionSchema,
  });
}
