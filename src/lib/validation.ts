/**
 * Shared input validation.
 *
 * These used to be re-declared in every server action and page. Keeping one copy
 * means a validation change (or a fix) lands everywhere at once.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLUB_EMAIL_PATTERN = /^[^@\s]+@atu\.ie$/i;

export const CLUB_EMAIL_DOMAIN = "atu.ie";

/** True for a syntactically valid UUID (any version bits). */
export function isUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** True for an `@atu.ie` address with a non-empty local part. */
export function isClubEmail(value: string | null | undefined): boolean {
  return typeof value === "string" && CLUB_EMAIL_PATTERN.test(value.trim());
}
