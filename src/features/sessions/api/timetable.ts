import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { PersistedCourtGame } from "@/features/sessions/court-schedule";
import {
  buildSessionTimetable,
  type TimetablePlayer,
  type TimetableSession,
} from "@/features/sessions/timetable-plan";
import type { createClient } from "@/lib/supabase/server";
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

/** The version each session's saved timetable is on, for change notices. */
export async function readTimetableVersions(
  sessionIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (sessionIds.length === 0) {
    return result;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("session_timetables")
    .select("session_id, version")
    .in("session_id", sessionIds);
  if (error) {
    logError("Could not read saved timetable versions.", error);
    return result;
  }

  for (const row of data ?? []) {
    result.set(row.session_id, row.version);
  }

  return result;
}

/**
 * Rebuild a session's timetable after the roster genuinely changed.
 *
 * Cancelling before the first serve no longer deletes the saved row (which
 * would reset its version and hide the change from everyone). It re-plans with
 * the new roster and bumps the version, which is what makes the dashboard say
 * "the timetable moved" once.
 */
export async function rebuildSessionTimetable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("id, event_date, starts_at, duration_minutes, capacity, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    logError("Could not read the session to rebuild its timetable.", {
      code: sessionError?.code,
    });
    return;
  }

  // Only a confirmed session has a published timetable to keep up to date.
  if (session.status !== "confirmed") {
    return;
  }

  const { data: inputs, error: inputsError } = await supabase.rpc(
    "get_schedule_inputs",
    { p_session_ids: [sessionId] },
  );
  if (inputsError) {
    logError("Could not read the roster to rebuild the timetable.", {
      code: inputsError.code,
    });
    return;
  }

  const persisted =
    (await readPersistedTimetables([sessionId])).get(sessionId) ?? null;

  await ensureSessionTimetable({
    session: {
      id: session.id,
      date: session.event_date,
      startsAt: session.starts_at,
      durationMinutes: session.duration_minutes,
      capacity: session.capacity,
      isConfirmed: true,
    },
    players: (inputs ?? []).map((player) => ({
      id: player.user_id,
      displayName: player.display_name,
      priority: player.slot_number ?? 1,
      friendIds: player.friend_ids ?? [],
      isCommittee: player.is_committee,
    })),
    persisted,
    forceRefresh: true,
  });
}

export async function ensureSessionTimetable({
  session,
  players,
  persisted,
  seed,
  forceRefresh = false,
}: {
  session: TimetableSession;
  players: TimetablePlayer[];
  persisted?: PersistedCourtGame[] | null;
  seed?: string;
  /** Rebuild a released timetable after the roster genuinely changed. */
  forceRefresh?: boolean;
}): Promise<PersistedCourtGame[]> {
  const plan = buildSessionTimetable({
    session,
    players,
    persisted,
    seed,
    forceRefresh,
  });
  const allocation = plan.games;

  if (!plan.needsPersisting) {
    return allocation;
  }

  // Never overwrite a published timetable with an empty one. That happens when
  // the roster was read before places were confirmed, and it would hide every
  // player's games until somebody repaired it by hand.
  if (allocation.length === 0) {
    logError("Refusing to save an empty timetable.", undefined, {
      sessionId: session.id,
    });
    return allocation;
  }

  try {
    const admin = createAdminClient();
    // One writer, so the version always moves with the data. The function also
    // lifts the release lock for this write: a member cancelling before the
    // first serve makes the published schedule wrong, and the players are told.
    const { error } = await admin.rpc("save_session_timetable", {
      p_session_id: session.id,
      p_court_schedule: allocation as Exclude<Json, null>,
      p_generated_by: undefined,
    });
    if (error) {
      throw error;
    }
  } catch (error) {
    logError("Could not save the session timetable.", error, {
      sessionId: session.id,
    });
  }

  return allocation;
}
