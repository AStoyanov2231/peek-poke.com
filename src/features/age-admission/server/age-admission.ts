import { createServiceClient } from "@/lib/supabase/server";
import { ageAdmissionSchema, type AgeAdmission } from "@peekpoke/shared";

export type { AgeAdmission } from "@peekpoke/shared";

type AgeAdmissionResult =
  | { data: AgeAdmission; unavailable?: never }
  | { data?: never; unavailable: true };

const MIN_BIRTH_YEAR = 1900;

function utcDateParts(value: Date) {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

/**
 * Parses a calendar-only birth date without relying on the host time zone.
 * The value is intentionally used only for the current request and is never
 * returned, logged, or persisted by this module.
 */
export function parseBirthDate(value: string, now = new Date()): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || year < MIN_BIRTH_YEAR || month < 1 || month > 12 || day < 1 || day > 31)
    return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) return null;
  const today = utcDateParts(now);
  const candidateParts = utcDateParts(candidate);
  if (
    candidateParts.year > today.year
    || (candidateParts.year === today.year && candidateParts.month > today.month)
    || (candidateParts.year === today.year && candidateParts.month === today.month && candidateParts.day > today.day)
  ) return null;
  return candidate;
}

/**
 * A Feb 29 declaration reaches its eighteenth anniversary on Mar 1 in a
 * non-leap year. Date.UTC intentionally carries that calendar overflow.
 */
export function isAdultBirthDate(value: string, now = new Date()): boolean | null {
  const birthDate = parseBirthDate(value, now);
  if (!birthDate) return null;
  const eighteenthBirthday = new Date(Date.UTC(
    birthDate.getUTCFullYear() + 18,
    birthDate.getUTCMonth(),
    birthDate.getUTCDate(),
  ));
  return eighteenthBirthday.getTime() <= Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
}

export async function readAccountAgeAdmission(userId: string): Promise<AgeAdmissionResult> {
  const { data, error } = await createServiceClient().rpc("read_account_age_admission_v1", {
    p_user_id: userId,
  });
  if (error) return { unavailable: true };
  const parsed = ageAdmissionSchema.safeParse(data);
  return parsed.success ? { data: parsed.data } : { unavailable: true };
}

export async function recordAccountAgeAdmission(
  userId: string,
  isAdult: boolean,
): Promise<AgeAdmissionResult> {
  const { data, error } = await createServiceClient().rpc("record_account_age_admission_v1", {
    p_user_id: userId,
    p_is_adult: isAdult,
  });
  if (error) return { unavailable: true };
  const parsed = ageAdmissionSchema.safeParse(data);
  return parsed.success ? { data: parsed.data } : { unavailable: true };
}
