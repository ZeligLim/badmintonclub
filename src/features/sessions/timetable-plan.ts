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

/**
 * Pure timetable planning.
 *
 * Read paths (the member dashboard, the admin schedule) use this so rendering a
 * page never writes. Saving a planned timetable is the job of
 * `ensureSessionTimetable` in `api/timetable.ts`.
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

export type SessionTimetablePlan = {
  /** The schedule that should be shown for this session right now. */
  games: PersistedCourtGame[];
  /** True when the schedule exists only in memory and still needs saving. */
  needsPersisting: boolean;
  /** True once the release cutoff has passed; the saved row then wins. */
  isLocked: boolean;
};

/**
 * Decides what a session's timetable should look like without touching the
 * database. Read paths use this so a page render never writes; the one place
 * that persists is `ensureSessionTimetable`.
 */
export function buildSessionTimetable({
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
  /**
   * Rebuild even though the timetable is released. Used when the roster
   * genuinely changed (a late cancellation) and the published schedule is now
   * wrong — a locked schedule must never be refreshed just because the
   * allocator changed.
   */
  forceRefresh?: boolean;
}): SessionTimetablePlan {
  const isLocked = isSessionTimetableLocked({
    eventDate: session.date,
    startsAt: session.startsAt,
  });
  const needsRebuild =
    forceRefresh ||
    shouldRefreshPersistedCourtSchedule(persisted, {
      isLocked,
      isConfirmed: session.isConfirmed,
    });

  if (!needsRebuild) {
    return {
      games: isPersistedCourtSchedule(persisted) ? persisted : [],
      needsPersisting: false,
      isLocked,
    };
  }

  if (players.length === 0) {
    return { games: [], needsPersisting: false, isLocked };
  }

  const roster: CourtRosterPlayer[] = players.map((player) => ({
    id: player.id,
    displayName: player.displayName,
    priority: player.priority ?? 1,
    friendIds: player.friendIds ?? [],
    isCommittee: player.isCommittee ?? false,
    level: player.level ?? null,
  }));

  return {
    games: markCourtScheduleCurrent(
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
    ),
    needsPersisting: true,
    isLocked,
  };
}
