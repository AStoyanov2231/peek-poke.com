const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export type BirthDateFields = { day: string; month: string; year: string };

/** Builds a calendar-only server input. The server validates the actual date. */
export function birthDateRequest(fields: BirthDateFields): string | null {
  const day = fields.day.trim();
  const month = fields.month.trim();
  const year = fields.year.trim();
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function birthDateReview(fields: BirthDateFields): string | null {
  const request = birthDateRequest(fields);
  if (!request) return null;
  const month = Number(fields.month);
  return month >= 1 && month <= 12
    ? `${Number(fields.day)} ${MONTHS[month - 1]} ${fields.year}`
    : request;
}
