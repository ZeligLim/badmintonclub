import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  allocateCourtSchedule,
  getCourtCount,
  isPersistedCourtSchedule,
  isSessionTimetableLocked,
  markCourtScheduleCurrent,
  shouldRefreshPersistedCourtSchedule,
  type CourtRosterPlayer,
  type PersistedCourtGame,
  type PlayerLevel,
} from "@/features/sessions/court-schedule";
import { logError } from "@/lib/log";

/**
 * The one place that builds, stores and reads a session's court timetable.
 *
 * The member dashboard, the admin schedule and the confirmation email used to
 * each run their own copy of this logic, which is how two viewers could end up
 * with two different timetables. They now all call in here.
 */

export type TimetableSession = {
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:MM` or `HH:MM:SS`, London time. */
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  isConfirmed: boolean;
};

export type TimetablePlayer = {
  id: string;
  displayName: string;
  priority?: number;
  friendIds?: string[];
  isCommittee?: boolean;
  level?: PlayerLevel | null;
};

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
    logError("Could not read saved timetables.", error);
    return result;
  }

  for (const row of data ?? []) {
    const schedule = asPersistedTimetable(row.court_schedule);
    if (schedule) {
      result.set(row.session_id, schedule);
    }
  }

  return result;
}

/**
 * Return the timetable a player should see, building and persisting it first if
 * the saved one is missing, stale, or still open to change.
 */
export async function ensureSessionTimetable({
  session,
  players,
  persisted,
  seed,
}: {
  session: TimetableSession;
  players: TimetablePlayer[];
  persisted?: PersistedCourtGame[] | null;
  seed?: string;
}): Promise<PersistedCourtGame[]> {
  const isLocked = isSessionTimetableLocked({
    eventDate: session.date,
    startsAt: session.startsAt,
  });
  const needsRebuild = shouldRefreshPersistedCourtSchedule(persisted, {
    isLocked,
    isConfirmed: session.isConfirmed,
  });

  if (!needsRebuild) {
    return isPersistedCourtSchedule(persisted) ? persisted : [];
  }

  if (players.length === 0) {
    return [];
  }

  const roster: CourtRosterPlayer[] = players.map((player) => ({
    id: player.id,
    displayName: player.displayName,
    priority: player.priority ?? 1,
    friendIds: player.friendIds ?? [],
    isCommittee: player.isCommittee ?? false,
    level: player.level ?? null,
  }));

  const allocation = markCourtScheduleCurrent(
    allocateCourtSchedule(
      {
        id: session.id,
        startsAt: session.startsAt,
        durationMinutes: session.durationMinutes,
        courtCount: getCourtCount(session.capacity),
      },
      roster,
      seed ? { seed } : undefined,
    ),
  );

  try {
    const admin = createAdminClient();
    await admin.from("session_timetables").upsert(
      {
        session_id: session.id,
        court_schedule: allocation as Exclude<Json, null>,
        generated_by: null,
        generated_at: new Date().toISOString(),
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
