import type { AllocatedCourtGame, CourtRosterPlayer } from "./court-schedule";

/**
 * The subset of {@link ClubSession} the allocator needs. Tests use literals
 * rather than a full session so a scenario only states what it cares about.
 */
export type SessionSpec = {
  id: string;
  startsAt: string;
  durationMinutes: number;
  courtCount: number;
};

/** Monday: two courts, 60 minutes => four rounds of 15 minutes. */
export const monday60min: SessionSpec = {
  id: "session-monday",
  startsAt: "18:00",
  durationMinutes: 60,
  courtCount: 2,
};

/** Wednesday: four courts, 120 minutes => eight rounds of 15 minutes. */
export const wednesday120min: SessionSpec = {
  id: "session-wednesday",
  startsAt: "18:00",
  durationMinutes: 120,
  courtCount: 4,
};

/** A single round — every active player appears exactly once. */
export const singleRound: SessionSpec = {
  id: "single-round",
  startsAt: "18:00",
  durationMinutes: 15,
  courtCount: 2,
};

export function makeSession(
  overrides: Partial<SessionSpec> = {},
): SessionSpec {
  return { ...singleRound, ...overrides };
}

export function makeRoster(
  count: number,
  options?: {
    friendPreferences?: Record<string, string[]>;
    priorities?: Record<string, number>;
    levels?: Record<string, CourtRosterPlayer["level"]>;
  },
): CourtRosterPlayer[] {
  const roster: CourtRosterPlayer[] = [];
  for (let i = 1; i <= count; i++) {
    const id = `player-${i}`;
    roster.push({
      id,
      displayName: `Player ${i}`,
      priority: options?.priorities?.[id] ?? 1,
      friendIds: options?.friendPreferences?.[id] ?? [],
      level: options?.levels?.[id],
    });
  }
  return roster;
}

/**
 * Builds a roster from an explicit list so that scenarios can name the
 * players they care about.
 */
export function makeNamedRoster(
  players: Array<{
    id: string;
    friendIds?: string[];
    priority?: number;
    isCommittee?: boolean;
    level?: CourtRosterPlayer["level"];
  }>,
): CourtRosterPlayer[] {
  return players.map((player) => ({
    id: player.id,
    displayName: player.id,
    priority: player.priority ?? 1,
    friendIds: player.friendIds ?? [],
    isCommittee: player.isCommittee ?? false,
    level: player.level,
  }));
}

export function countGamesPerPlayer(
  schedule: AllocatedCourtGame[],
  roster: CourtRosterPlayer[],
): Map<string, number> {
  const counts = new Map<string, number>(roster.map((p) => [p.id, 0]));
  for (const game of schedule) {
    for (const player of game.players) {
      counts.set(player.id, (counts.get(player.id) ?? 0) + 1);
    }
  }
  return counts;
}

export function courtOf(
  schedule: AllocatedCourtGame[],
  playerId: string,
): AllocatedCourtGame | undefined {
  return schedule.find((game) => game.players.some((p) => p.id === playerId));
}

export function courtPlayerIds(
  game: AllocatedCourtGame | undefined,
): string[] {
  return (game?.players ?? []).map((player) => player.id).sort();
}

/** Counts the directed friend requests that end up on the same court. */
export function countSatisfiedEdges(schedule: AllocatedCourtGame[]): number {
  let satisfied = 0;
  for (const game of schedule) {
    const playerIds = new Set(game.players.map((p) => p.id));
    for (const player of game.players) {
      for (const friendId of player.friendIds ?? []) {
        if (playerIds.has(friendId)) {
          satisfied += 1;
        }
      }
    }
  }
  return satisfied;
}

/** The rounds of a schedule, in the order they are played. */
export function roundsOf(schedule: AllocatedCourtGame[]): string[] {
  return [...new Set(schedule.map((game) => game.startAt))].sort();
}

export function gamesAt(
  schedule: AllocatedCourtGame[],
  startAt: string,
): AllocatedCourtGame[] {
  return schedule.filter((game) => game.startAt === startAt);
}
