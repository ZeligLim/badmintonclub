import "server-only";

import type { createClient } from "@/lib/supabase/server";

/**
 * The club's clock, not the visitor's.
 *
 * In development a virtual clock is read here (server-side) so `npm run dev`
 * can still travel in time. Every deadline decision — sign-up windows,
 * confirmation, the timetable release — must use this value so the member view
 * and the admin view agree about what "now" means.
 */
export async function getClubNow(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Date> {
  if (process.env.NODE_ENV !== "development") {
    return new Date();
  }

  const { data } = await supabase
    .from("dev_virtual_clock")
    .select("virtual_now")
    .eq("id", 1)
    .maybeSingle();

  return data?.virtual_now ? new Date(data.virtual_now) : new Date();
}
