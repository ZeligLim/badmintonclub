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
import { GAME_DURATION_MINUTES } from "@/features/sessions/court-schedule.shared";
import { getCourtSizes } from "@/features/sessions/court-schedule.validate";
import { addMinutesToTime } from "@/lib/sessions/schedule";

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
  courtCount?: number;
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

/** Checks that saved seat assignments still fit the live session roster. */
export function isTimetableCompatibleWithRoster({
  session,
  players,
  games,
}: {
  session: TimetableSession;
  players: TimetablePlayer[];
  games: unknown;
}): boolean {
  if (!isPersistedCourtSchedule(games)) return false;

  const courtCount = session.courtCount ?? getCourtCount(session.capacity);
  const expectedRounds = Math.ceil(session.durationMinutes / GAME_DURATION_MINUTES);
  const rosterIds = new Set(players.map((player) => player.id));
  const savedCounts = new Map(players.map((player) => [player.id, 0]));
  const roundPlayers = new Map<string, Set<string>>();
  const roundCourts = new Map<string, Set<number>>();
  const courtSizes = getCourtSizes(players.length, courtCount);
  const expectedCourtCount = courtSizes.length;
  const expectedStartTimes = new Set(
    Array.from({ length: expectedRounds }, (_, round) =>
      addMinutesToTime(session.startsAt, round * GAME_DURATION_MINUTES),
    ),
  );
  let compatible = games.length === expectedRounds * expectedCourtCount;

  for (const game of games) {
    if (
      game.courtNumber < 1 ||
      game.courtNumber > expectedCourtCount ||
      game.players.length !== courtSizes[game.courtNumber - 1] ||
      !expectedStartTimes.has(game.startAt)
    ) {
      compatible = false;
    }
    const courts = roundCourts.get(game.startAt) ?? new Set<number>();
    if (courts.has(game.courtNumber)) compatible = false;
    courts.add(game.courtNumber);
    roundCourts.set(game.startAt, courts);

    const round = roundPlayers.get(game.startAt) ?? new Set<string>();
    for (const player of game.players) {
      if (!rosterIds.has(player.id) || round.has(player.id)) {
        compatible = false;
      }
      round.add(player.id);
      if (savedCounts.has(player.id)) {
        savedCounts.set(player.id, savedCounts.get(player.id)! + 1);
      }
    }
    roundPlayers.set(game.startAt, round);
  }

  const gameCounts = [...savedCounts.values()];
  const maxGames = Math.max(...gameCounts, 0);
  const minGames = Math.min(...gameCounts, Number.POSITIVE_INFINITY);
  if (gameCounts.length === 0 || maxGames - minGames > 1) {
    compatible = false;
  }
  if (
    roundPlayers.size !== expectedRounds ||
    [...roundCourts.values()].some((courts) => courts.size !== expectedCourtCount)
  ) {
    compatible = false;
  }

  return compatible;
}

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
  now,
}: {
  session: TimetableSession;
  players: TimetablePlayer[];
  persisted?: PersistedCourtGame[] | null;
  seed?: string;
  /** The club's clock. Defaults to the server's clock. */
  now?: Date;
}): SessionTimetablePlan {
  const isLocked = isSessionTimetableLocked(
    {
      eventDate: session.date,
      startsAt: session.startsAt,
    },
    now,
  );
  const needsRebuild = shouldRefreshPersistedCourtSchedule(persisted, {
    isLocked,
    isConfirmed: session.isConfirmed,
  });

  if (!needsRebuild && !isLocked && !session.isConfirmed) {
    if (isTimetableCompatibleWithRoster({ session, players, games: persisted })) {
      return {
        games: isPersistedCourtSchedule(persisted) ? persisted : [],
        needsPersisting: false,
        isLocked,
      };
    }
  }

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
          courtCount: session.courtCount ?? getCourtCount(session.capacity),
        },
        roster,
        seed ? { seed } : undefined,
      ),
    ),
    needsPersisting: true,
    isLocked,
  };
}
