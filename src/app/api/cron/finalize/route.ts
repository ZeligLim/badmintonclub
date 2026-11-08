import { NextResponse } from "next/server";

import { logError } from "@/lib/log";
import { isAuthorizedCronRequest } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeDueSessionsAndEmail } from "@/features/sessions/api/booking-confirmation-email";

/**
 * The scheduled half of the confirmation deadline (BC-07).
 *
 * `vercel.json` asks Vercel to call this once a day; the dashboard keeps its
 * client-side call as a fallback for the deadlines that fall between runs
 * (first-come-first-served sessions close 30 minutes before they start). This
 * route is the only path that confirms a session without a browser being open.
 *
 * No `dynamic` export: this project runs `cacheComponents`, which forbids the
 * route-segment config; the handler reads the request and touches the database,
 * so Next never treats it as static.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const finalized = await finalizeDueSessionsAndEmail(createAdminClient(), {
      asService: true,
    });
    return NextResponse.json({ finalized });
  } catch (error) {
    logError("The scheduled finalization failed.", error);
    return NextResponse.json(
      { error: "The scheduled finalization failed." },
      { status: 500 },
    );
  }
}
