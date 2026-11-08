/** The header Vercel sends to a scheduled function when `CRON_SECRET` is set. */
export function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  return authorization === `Bearer ${secret}`;
}
