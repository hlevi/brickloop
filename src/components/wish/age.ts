/**
 * Neutral age screen rules. Pure and client-side only: the answer is used once to
 * decide what to show and is never sent, stored, logged or put in a cookie.
 */
export const MAX_AGE_YEARS = 110;

/** Birth years offered, newest first. There is deliberately no default. */
export function birthYearOptions(now = new Date()): number[] {
  const y = now.getFullYear();
  return Array.from({ length: MAX_AGE_YEARS + 1 }, (_, i) => y - i);
}

/** Adult when the birth year makes the person 18 or older this year. Anything unclear is not adult. */
export function isAdultBirthYear(year: unknown, now = new Date()): boolean {
  const y = typeof year === "string" && year.trim() !== "" ? Number(year) : year;
  if (typeof y !== "number" || !Number.isInteger(y)) return false;
  const current = now.getFullYear();
  if (y < current - MAX_AGE_YEARS || y > current) return false;
  return current - y >= 18;
}
