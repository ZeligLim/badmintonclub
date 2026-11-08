import { addMinutesToTime, londonDateTime } from "@/lib/sessions/schedule";
import type { ClubSession } from "./types";
import {
  compareLevelRank,
  levelSpreadWithin,
  levelValue,
} from "./court-schedule.levels";
import type { PlayerLevel } from "./court-schedule.levels";

import {
  CAPACITY_PER_COURT,
  MAX_COURTS,
  TIMETABLE_RELEASE_MINUTES,
  COURT_ALLOCATION_VERSION,
  GAME_DURATION_MINUTES,
  type AllocatedCourtGame,
  type CourtRosterPlayer,
  type InternalPlayer,
  type PlayerGame,
} from "./court-schedule.shared";
import { allocateOnce } from "./court-schedule.candidates";
import { getCourtSizes, validateSchedule } from "./court-schedule.validate";
import { compareScore, scoreAllocation } from "./court-schedule.score";

export type { PlayerLevel } from "./court-schedule.levels";
export { COURT_ALLOCATION_VERSION } from "./court-schedule.shared";
export type {
  AllocatedCourtGame,
  CourtRosterPlayer,
  PlayerGame,
} from "./court-schedule.shared";


export type PersistedCourtGame = AllocatedCourtGame & {
  allocationVersion: typeof COURT_ALLOCATION_VERSION;
};

export function isCurrentPersistedCourtSchedule(
  value: unknown,
): value is PersistedCourtGame[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (game) =>
        typeof game === "object" &&
        game !== null &&
        "allocationVersion" in game &&
        game.allocationVersion === COURT_ALLOCATION_VERSION,
    )
  );
}

export function markCourtScheduleCurrent(
  schedule: AllocatedCourtGame[],
): PersistedCourtGame[] {
  return schedule.map((game) => ({
    ...game,
    allocationVersion: COURT_ALLOCATION_VERSION,
  }));
}

/**
 * Structural check for a saved timetable. Unlike
 * {@link isCurrentPersistedCourtSchedule}, this deliberately ignores the
 * allocation version: once a timetable is published it must stay readable even
 * after the allocator changes.
 */
export function isPersistedCourtSchedule(
  value: unknown,
): value is AllocatedCourtGame[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((game) => {
      if (typeof game !== "object" || game === null) return false;
      const candidate = game as Partial<AllocatedCourtGame>;
      return (
        typeof candidate.courtNumber === "number" &&
        typeof candidate.startAt === "string" &&
        typeof candidate.endAt === "string" &&
        Array.isArray(candidate.players) &&
        candidate.players.length > 0 &&
        candidate.players.every(
          (player) =>
            typeof player === "object" &&
            player !== null &&
            typeof player.id === "string" &&
            typeof player.displayName === "string",
        )
      );
    })
  );
}

/**
 * True once players can see the timetable. From this moment the saved
 * timetable is the single source of truth and must never be regenerated or
 * deleted.
 */
export function isSessionTimetableLocked(
  session: { eventDate: string; startsAt: string },
  now: Date = new Date(),
): boolean {
  let startAt: number;
  if (session.startsAt.includes("T")) {
    startAt = new Date(session.startsAt).getTime();
  } else {
    const [hour, minute] = session.startsAt.split(":").map(Number);
    const sessionDate = new Date(`${session.eventDate}T12:00:00Z`);
    startAt =
      Number.isFinite(hour) &&
      Number.isFinite(minute) &&
      Number.isFinite(sessionDate.getTime())
        ? new Date(londonDateTime(sessionDate, hour, minute)).getTime()
        : Number.NaN;
  }
  // A timestamp we cannot read must not look "not released yet": that would
  // let a corrupt row be regenerated after players had already seen it.
  if (!Number.isFinite(startAt)) return true;
  return now.getTime() >= startAt - TIMETABLE_RELEASE_MINUTES * 60_000;
}

/**
 * A saved timetable is refreshed only while it is still private. A published
 * timetable is used exactly as saved, even if it was produced by an older
 * allocator version.
 */
export function shouldRefreshPersistedCourtSchedule(
  value: unknown,
  options: { isLocked: boolean; isConfirmed?: boolean },
): boolean {
  if (!isPersistedCourtSchedule(value)) return true;
  // A confirmed timetable has already been announced to players by email or
  // on the dashboard. Never rewrite it just because the allocator changed.
  if (options.isLocked || options.isConfirmed) return false;
  return !isCurrentPersistedCourtSchedule(value);
}

/** Project a saved timetable into the games one player appears in. */
export function getPlayerGamesFromCourtSchedule(
  schedule: AllocatedCourtGame[],
  playerId: string,
): PlayerGame[] {
  return schedule
    .filter((game) => game.players.some((player) => player.id === playerId))
    .map(({ courtNumber, startAt, endAt, players }) => ({
      courtNumber,
      startAt,
      endAt,
      courtPlayers: players
        .filter((player) => player.id !== playerId)
        .map((player) => player.displayName),
    }));
}

export function getCourtCount(capacity: number): number {
  return Math.min(Math.ceil(capacity / CAPACITY_PER_COURT), MAX_COURTS);
}

export function allocateCourtSchedule(
  session: Pick<ClubSession, "id" | "startsAt" | "durationMinutes" | "courtCount">,
  roster: CourtRosterPlayer[],
  options?: { candidateCount?: number; seed?: string },
): AllocatedCourtGame[] {
  if (roster.length === 0) {
    throw new Error("Court allocation requires at least one confirmed player.");
  }
  const uniquePlayerIds = new Set(roster.map((player) => player.id));
  if (uniquePlayerIds.size !== roster.length) {
    throw new Error("Court allocation roster contains duplicate player IDs.");
  }
  if (!Number.isInteger(session.durationMinutes) || session.durationMinutes <= 0) {
    throw new Error("Court allocation requires a positive whole-number session duration.");
  }
  if (!Number.isInteger(session.courtCount) || session.courtCount <= 0) {
    throw new Error("Court allocation requires at least one court.");
  }
  const candidateCount = resolveCandidateCount(options?.candidateCount, roster);
  let bestSchedule: AllocatedCourtGame[] | null = null;
  let bestScore: number[] | null = null;
  let lastCandidateError: unknown;

  for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
    try {
      const candidateSeed = options?.seed
        ? `${options.seed}|candidate-${candidateIndex}`
        : `candidate-${candidateIndex}`;
      const candidate = allocateOnce(session, roster, candidateSeed);
      const score = scoreAllocation(session, roster, candidate);
      if (
        bestScore === null ||
        compareScore(score, bestScore) < 0
      ) {
        bestScore = score;
        bestSchedule = candidate;
      }
    } catch (error) {
      // Candidates that cannot be fully allocated are never candidates.
      lastCandidateError = error;
    }
  }

  if (!bestSchedule) {
    throw new Error("Court allocation could not produce a valid timetable.", {
      cause: lastCandidateError,
    });
  }

  try {
    validateSchedule(
      bestSchedule,
      getCourtSizes(roster.length, session.courtCount),
      Math.ceil(session.durationMinutes / GAME_DURATION_MINUTES),
      new Set(roster.map((player) => player.id)),
    );
  } catch (error) {
    throw new Error("Court allocation produced an invalid timetable.", {
      cause: error,
    });
  }

  return bestSchedule;
}

export function createPlayerGameSchedule(
  session: Pick<ClubSession, "id" | "durationMinutes" | "courtCount" | "startsAt">,
  roster: CourtRosterPlayer[],
  playerId: string,
): PlayerGame[] {
  return allocateCourtSchedule(session, roster)
    .filter((game) => game.players.some((player) => player.id === playerId))
    .map(({ courtNumber, startAt, endAt, players }) => ({
      courtNumber,
      startAt,
      endAt,
      courtPlayers: players
        .filter((player) => player.id !== playerId)
        .map((player) => player.displayName),
    }));
}

function resolveCandidateCount(
  value: number | undefined,
  roster: CourtRosterPlayer[],
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    const committeeIds = new Set(
      roster.filter((player) => player.isCommittee).map((player) => player.id),
    );
    const overlappingCommitteeRequests = roster.reduce((total, player) => {
      if (!player.isCommittee) return total;
      const requestedIds = new Set(player.friendIds ?? []);
      return total + [...requestedIds].filter((id) => committeeIds.has(id)).length;
    }, 0);

    // Dense committee friend networks need more candidate schedules to find
    // fair rotations that keep the requested friends on court together.
    return overlappingCommitteeRequests >= 4 ? 500 : 100;
  }
  return Math.round(value);
}
