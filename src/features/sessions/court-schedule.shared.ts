/**
 * Shared types, constants and small pure helpers used by every stage of the
 * court allocation pipeline.
 */
import type { PlayerLevel } from "./court-schedule.levels";
import { compareLevelRank } from "./court-schedule.levels";

export const GAME_DURATION_MINUTES = 15;

export const PLAYERS_PER_COURT = 4;

/** Capacity a single court can serve in one session (two 4-player games). */
export const CAPACITY_PER_COURT = PLAYERS_PER_COURT * 2;

export const MAX_COURTS = 4;

/** Players see the timetable this long before the session starts. */
export const TIMETABLE_RELEASE_MINUTES = 30;

export const COURT_ALLOCATION_VERSION = 9;

export type { PlayerLevel } from "./court-schedule.levels";

export type CourtRosterPlayer = {
  id: string;
  displayName: string;
  /** Legacy signup ordering metadata; anchor precedence uses isCommittee. */
  priority?: number;
  /** One-way outgoing friendship requests. Mutual requests are not required. */
  friendIds?: string[];
  level?: PlayerLevel | null;
  isCommittee?: boolean;
};

export type AllocatedCourtGame = {
  courtNumber: number;
  startAt: string;
  endAt: string;
  players: CourtRosterPlayer[];
  teamA?: [CourtRosterPlayer, CourtRosterPlayer];
  teamB?: [CourtRosterPlayer, CourtRosterPlayer];
};

export type PlayerGame = {
  courtNumber: number;
  startAt: string;
  endAt: string;
  courtPlayers: string[];
};

export type InternalPlayer = CourtRosterPlayer & {
  rosterIndex: number;
  normalizedFriendIds: string[];
  /** Stable random tie-break value for this schedule generation. */
  randomRank: number;
};

export type ScheduleTrackingState = {
  gamesPlayed: Map<string, number>;
  consecutiveRests: Map<string, number>;
  totalRests: Map<string, number>;
  lastPlayedRound: Map<string, number>;
  physicalCourtAssignments: Map<string, Map<number, number>>;
  courtCoPresence: Map<string, Map<string, number>>;
  doublesPartnerships: Map<string, Map<string, number>>;
  doublesOpponents: Map<string, Map<string, number>>;
};

export function comparePlayerIds(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function hashText(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createDeterministicRng(seedText: string): () => number {
  let state = hashText(seedText) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function compareGameFairness(
  a: InternalPlayer,
  b: InternalPlayer,
  state: ScheduleTrackingState,
): number {
  return (
    compareGameFairnessPriority(a, b, state) ||
    compareLevelRank(a, b) ||
    comparePlayerIds(a, b)
  );
}

export function compareGameFairnessPriority(
  a: InternalPlayer,
  b: InternalPlayer,
  state: ScheduleTrackingState,
): number {
  const gamesA = state.gamesPlayed.get(a.id) ?? 0;
  const gamesB = state.gamesPlayed.get(b.id) ?? 0;
  if (gamesA !== gamesB) return gamesA - gamesB;

  const restsA = state.consecutiveRests.get(a.id) ?? 0;
  const restsB = state.consecutiveRests.get(b.id) ?? 0;
  if (restsA !== restsB) return restsB - restsA;

  const totalRestsA = state.totalRests.get(a.id) ?? 0;
  const totalRestsB = state.totalRests.get(b.id) ?? 0;
  if (totalRestsA !== totalRestsB) return totalRestsB - totalRestsA;

  return 0;
}

export function countFriendEdgesBetween(
  firstId: string,
  secondId: string,
  friendMap: Map<string, Set<string>>,
): number {
  return Number(friendMap.get(firstId)?.has(secondId) ?? false) +
    Number(friendMap.get(secondId)?.has(firstId) ?? false);
}

export function incrementPairCount(
  map: Map<string, Map<string, number>>,
  firstId: string,
  secondId: string,
): void {
  const inner = map.get(firstId)!;
  inner.set(secondId, (inner.get(secondId) ?? 0) + 1);
}

export function toRosterPlayer(player: InternalPlayer): CourtRosterPlayer {
  return {
    id: player.id,
    displayName: player.displayName,
    priority: player.priority,
    friendIds: [...player.normalizedFriendIds],
    level: player.level,
    isCommittee: player.isCommittee,
  };
}

/**
 * Committee members anchor before other eligible players. Ties are randomized
 * once per schedule generation so the ranking stays stable within a schedule.
 */
export function compareAnchorPriority(a: InternalPlayer, b: InternalPlayer): number {
  return (
    Number(Boolean(b.isCommittee)) - Number(Boolean(a.isCommittee)) ||
    b.normalizedFriendIds.length - a.normalizedFriendIds.length ||
    compareLevelRank(a, b) ||
    a.randomRank - b.randomRank ||
    comparePlayerIds(a, b)
  );
}
