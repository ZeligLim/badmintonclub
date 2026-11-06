import { describe, expect, it } from "vitest";

import {
  allocateCourtSchedule,
  type AllocatedCourtGame,
  type CourtRosterPlayer,
} from "./court-schedule";
import { makeRoster, makeSession } from "./court-schedule.fixtures";

/** Small deterministic PRNG so a failure is reproducible from the seed. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const LEVELS: Array<CourtRosterPlayer["level"]> = [
  "BEGINNER",
  "INTERMEDIATE",
  "PROFESSIONAL",
];

function randomRoster(count: number, random: () => number): CourtRosterPlayer[] {
  const preferences: Record<string, string[]> = {};
  const levels: Record<string, CourtRosterPlayer["level"]> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `player-${i}`;
    const friendCount = Math.floor(random() * 3);
    const friends: string[] = [];
    for (let f = 0; f < friendCount; f += 1) {
      const candidate = `player-${1 + Math.floor(random() * count)}`;
      if (candidate !== id && !friends.includes(candidate)) {
        friends.push(candidate);
      }
    }
    preferences[id] = friends;
    levels[id] = LEVELS[Math.floor(random() * LEVELS.length)];
  }
  return makeRoster(count, { friendPreferences: preferences, levels });
}

function gamesByRound(games: AllocatedCourtGame[]): Map<string, AllocatedCourtGame[]> {
  const rounds = new Map<string, AllocatedCourtGame[]>();
  for (const game of games) {
    const list = rounds.get(game.startAt) ?? [];
    list.push(game);
    rounds.set(game.startAt, list);
  }
  return rounds;
}

describe("allocation invariants over random rosters", () => {
  for (const seed of [1, 7, 42, 1234]) {
    it(`holds for every random roster from seed ${seed}`, () => {
      const random = seeded(seed);

      for (let trial = 0; trial < 8; trial += 1) {
        const courtCount = 1 + Math.floor(random() * 4);
        const count = 4 + Math.floor(random() * 3) * 4 + Math.floor(random() * 4);
        const roster = randomRoster(count, random);
        const session = makeSession({
          id: `random-${seed}-${trial}`,
          durationMinutes: 60,
          courtCount,
        });

        const games = allocateCourtSchedule(session, roster);
        const rosterIds = new Set(roster.map((player) => player.id));

        for (const game of games) {
          expect(game.courtNumber).toBeGreaterThanOrEqual(1);
          expect(game.courtNumber).toBeLessThanOrEqual(courtCount);
          for (const player of game.players) {
            expect(rosterIds.has(player.id)).toBe(true);
          }
        }

        for (const [, roundGames] of gamesByRound(games)) {
          const seen = new Set<string>();
          for (const game of roundGames) {
            for (const player of game.players) {
              expect(seen.has(player.id)).toBe(false);
              seen.add(player.id);
            }
          }
        }

        const counts = new Map<string, number>();
        for (const game of games) {
          for (const player of game.players) {
            counts.set(player.id, (counts.get(player.id) ?? 0) + 1);
          }
        }
        const values = [...counts.values()];
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe("allocation latency", () => {
  it("allocates a full 40-player, four-court evening within budget", () => {
    const roster = makeRoster(
      40,
      {
        friendPreferences: Object.fromEntries(
          Array.from({ length: 20 }, (_, index) => [
            `player-${index + 1}`,
            [`player-${index + 21}`],
          ]),
        ),
      },
    );
    const session = makeSession({
      id: "latency-40",
      durationMinutes: 120,
      courtCount: 4,
    });

    const startedAt = performance.now();
    const games = allocateCourtSchedule(session, roster);
    const elapsed = performance.now() - startedAt;

    expect(games.length).toBeGreaterThan(0);
    // The benchmark on CI-sized hardware runs in well under a second; the
    // budget leaves room for a slow shared runner without hiding a regression.
    expect(elapsed).toBeLessThan(5000);
  });
});
