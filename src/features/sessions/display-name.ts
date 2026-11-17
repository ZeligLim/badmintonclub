/**
 * Profiles are created with the email local part as the display name. For
 * students that is their ATU student number (`g00440629`), which is not the
 * name the club wants on court lists. The dashboard offers a one-time prompt
 * when it sees one of those names.
 */
const STUDENT_NUMBER_PATTERN = /^g\d{6,}$/i;

/** True while the member still has their student number as their display name. */
export function isStudentNumberDisplayName(
  name: string | null | undefined,
): boolean {
  return typeof name === "string" && STUDENT_NUMBER_PATTERN.test(name.trim());
}
