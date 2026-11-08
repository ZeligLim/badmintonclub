import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { PersistedCourtGame } from "@/features/sessions/court-schedule";
import {
  buildSessionTimetable,
  type TimetablePlayer,
  type TimetableSession,
} from "@/features/sessions/timetable-plan";
import { logError } from "@/lib/log";

/**
 * The one place that builds, stores and reads a session's court timetable.
 *
 * The member dashboard, the admin schedule and the confirmation email used to
 * each run their own copy of this logic, which is how two viewers could end up
 * with two different timetables. They now all call in here.
 */

/** Normalise the `jsonb` column into the typed timetable, if it looks like one. */
export function asPersistedTimetable(
  value: unknown,
): PersistedCourtGame[] | null {
  return Array.isArray(value) ? (value as PersistedCourtGame[]) : null;
}

/** Read every persisted timetable for the given sessions in one query. */
export async function readPersistedTimetables(
  sessionIds: string[],
): Promise<Map<string, PersistedCourtGame[]>> {
  const result = new Map<string, PersistedCourtGame[]>();
  if (sessionIds.length === 0) {
    return result;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("session_timetables")
    .select("session_id, court_schedule")
    .in("session_id", sessionIds);
  if (error) {
    logError("Could not read saved session timetables.", error);
    throw new Error("Could not read saved session timetables.");
  }

  for (const row of data ?? []) {
    const timetable = asPersistedTimetable(row.court_schedule);
    if (timetable) {
      result.set(row.session_id, timetable);
    }
  }

  return result;
}

export async function ensureSessionTimetable({
  session,
  players,
  persisted,
  seed,
  now,
}: {
  session: TimetableSession;
  players: TimetablePlayer[];
  persisted?: PersistedCourtGame[] | null;
  seed?: string;
  /** The club's clock. Defaults to the server's clock. */
  now?: Date;
}): Promise<PersistedCourtGame[]> {
  const plan = buildSessionTimetable({ session, players, persisted, seed, now });
  const allocation = plan.games;

  if (!plan.needsPersisting) {
    return allocation;
  }

  try {
    const admin = createAdminClient();
    await admin.from("session_timetables").upsert(
      {
        session_id: session.id,
        court_schedule: allocation as Exclude<Json, null>,
        generated_by: null,
        generated_at: (now ?? new Date()).toISOString(),
      },
      { onConflict: "session_id" },
    );
  } catch (error) {
    logError("Could not save the session timetable.", error, {
      sessionId: session.id,
    });
  }

  return allocation;
}
