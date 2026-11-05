import { describe, expect, it } from "vitest";
import { allocateCourtSchedule } from "./court-schedule";
import {
  countGamesPerPlayer,
  gamesAt,
  makeRoster,
  monday60min,
  roundsOf,
  wednesday120min,
} from "./court-schedule.fixtures";

describe("capacity and playing time", () => {
  // T1: Mathematical Capacity & Play Count Bounds (Hard Guarantee)
  it("spreads games within one across every roster size the club can field", () => {
    for (const N of [8, 9, 10, 11, 12, 13, 14, 15, 16]) {
      const roster = makeRoster(N);
      const schedule = allocateCourtSchedule(monday60min, roster);
      const counts = [...countGamesPerPlayer(schedule, roster).values()];

      const minGames = Math.min(...counts);
      const maxGames = Math.max(...counts);
      const totalSlotsAllocated = counts.reduce((sum, count) => sum + count, 0);

      expect(maxGames - minGames).toBeLessThanOrEqual(1);

      const activeSpotsPerRound = Math.min(N, 4 * monday60min.courtCount);
      const expectedTotalSlots = 4 * activeSpotsPerRound;
      expect(totalSlotsAllocated).toBe(expectedTotalSlots);

      const baseGames = Math.floor(expectedTotalSlots / N);
      const extraGames = expectedTotalSlots % N;
      expect(counts.filter((count) => count === baseGames + 1)).toHaveLength(
        extraGames,
      );
      expect(counts.filter((count) => count === baseGames)).toHaveLength(
        N - extraGames,
      );
    }
  });

  // T2: Under-Capacity Roster (Hard Guarantee)
  it("plays everyone in every round when there are fewer than four players", () => {
    for (const N of [1, 2, 3]) {
      const roster = makeRoster(N);
      const schedule = allocateCourtSchedule(monday60min, roster);

      for (const count of countGamesPerPlayer(schedule, roster).values()) {
        expect(count).toBe(4);
      }
      expect(schedule).toHaveLength(4);
    }
  });

  // T3: Single-Round Concurrency (Hard Guarantee)
  it("never puts the same player on two courts in one round", () => {
    const schedule = allocateCourtSchedule(monday60min, makeRoster(12));

    for (const startAt of roundsOf(schedule)) {
      const playerIdsInRound = gamesAt(schedule, startAt).flatMap((game) =>
        game.players.map((player) => player.id),
      );
      expect(new Set(playerIdsInRound).size).toBe(playerIdsInRound.length);
    }
  });

  // T4: Priority-Based Rest Selection (Hard Guarantee)
  it("prefers players who rested in the previous round", () => {
    const roster = makeRoster(10);
    const schedule = allocateCourtSchedule(monday60min, roster);
    const rounds = roundsOf(schedule);
    const gamesPlayedSoFar = new Map<string, number>(
      roster.map((player) => [player.id, 0]),
    );

    for (let r = 1; r < rounds.length; r++) {
      const activeIds = new Set(
        gamesAt(schedule, rounds[r]!).flatMap((game) =>
          game.players.map((player) => player.id),
        ),
      );
      const previousRoundIds = new Set(
        gamesAt(schedule, rounds[r - 1]!).flatMap((game) =>
          game.players.map((player) => player.id),
        ),
      );

      for (const rested of roster.filter(
        (player) => !previousRoundIds.has(player.id),
      )) {
        for (const played of roster.filter((player) =>
          previousRoundIds.has(player.id),
        )) {
          const restedHasFewerGames =
            gamesPlayedSoFar.get(rested.id)! <= gamesPlayedSoFar.get(played.id)!;
          if (restedHasFewerGames && activeIds.has(played.id)) {
            // A fresher player must not be passed over for one who just played.
            expect(activeIds.has(rested.id)).toBe(true);
          }
        }
      }

      for (const id of activeIds) {
        gamesPlayedSoFar.set(id, gamesPlayedSoFar.get(id)! + 1);
      }
    }
  });

  // T5: Minimal Rest Streaks (Hard Guarantee)
  it("never rests a player for two rounds in a row when a court is free", () => {
    const roster = makeRoster(10);
    const schedule = allocateCourtSchedule(monday60min, roster);
    const rounds = roundsOf(schedule);

    for (const player of roster) {
      let consecutiveRests = 0;
      for (const startAt of rounds) {
        const played = gamesAt(schedule, startAt).some((game) =>
          game.players.some((p) => p.id === player.id),
        );
        consecutiveRests = played ? 0 : consecutiveRests + 1;
        expect(consecutiveRests).toBeLessThanOrEqual(1);
      }
    }
  });

  // T6: Fairness remains a hard constraint while ties can honour friend links.
  it("keeps game counts fair when friend preferences break ties", () => {
    const plainRoster = makeRoster(10);
    const plainSchedule = allocateCourtSchedule(monday60min, plainRoster);
    const plainCounts = countGamesPerPlayer(plainSchedule, plainRoster);

    const friendRoster = makeRoster(10, {
      friendPreferences: {
        "player-1": ["player-2", "player-3", "player-4"],
        "player-2": ["player-1", "player-3"],
        "player-5": ["player-6"],
        "player-7": ["player-8"],
      },
    });
    const friendSchedule = allocateCourtSchedule(monday60min, friendRoster);
    const friendCounts = [...countGamesPerPlayer(friendSchedule, friendRoster).values()];

    expect(Math.max(...friendCounts) - Math.min(...friendCounts)).toBeLessThanOrEqual(1);
    expect(friendCounts.reduce((sum, count) => sum + count, 0)).toBe(
      [...plainCounts.values()].reduce((sum, count) => sum + count, 0),
    );
  });

  // A8: Game Fairness Is A Hard Constraint (docs/court-allocation.md, section 6)
  it("gives nobody a second game before everyone has had a first", () => {
    const scenarios = [
      { session: monday60min, rosterSizes: [9, 10, 12, 16] },
      { session: wednesday120min, rosterSizes: [16, 20, 24] },
    ];

    for (const { session, rosterSizes } of scenarios) {
      for (const rosterSize of rosterSizes) {
        const roster = makeRoster(rosterSize);
        const schedule = allocateCourtSchedule(session, roster);
        const gamesPlayed = new Map<string, number>(
          roster.map((player) => [player.id, 0]),
        );

        for (const startAt of roundsOf(schedule)) {
          const counts = [...gamesPlayed.values()];
          expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);

          for (const game of gamesAt(schedule, startAt)) {
            for (const player of game.players) {
              gamesPlayed.set(player.id, gamesPlayed.get(player.id)! + 1);
            }
          }
        }
      }
    }
  });

  // T12: Hard guarantees survive tie-dense inputs.
  it("keeps every hard guarantee when every choice is a tie", () => {
    const roster = makeRoster(10, {
      friendPreferences: {
        "player-1": ["player-2", "player-3", "player-4"],
        "player-2": ["player-3", "player-5", "player-6"],
        "player-3": ["player-1", "player-2", "player-7"],
        "player-4": ["player-1", "player-2"],
        "player-5": ["player-2"],
        "player-6": ["player-1", "player-3"],
        "player-7": ["player-3", "player-8"],
        "player-8": ["player-4", "player-7"],
      },
    });

    for (let run = 0; run < 2; run++) {
      const schedule = allocateCourtSchedule(monday60min, roster);

      for (const game of schedule) {
        expect(game.players).toHaveLength(4);
        expect(new Set(game.players.map((player) => player.id)).size).toBe(4);
      }
      for (const startAt of roundsOf(schedule)) {
        const ids = gamesAt(schedule, startAt).flatMap((game) =>
          game.players.map((player) => player.id),
        );
        expect(new Set(ids).size).toBe(ids.length);
      }
      expect(schedule).toHaveLength(monday60min.courtCount * 4);
    }
  });
});

describe("determinism", () => {
  // T11: Randomness only breaks ties that the rules leave open; the same
  // input must always produce the same timetable.
  it("returns an identical timetable for repeated calls", () => {
    const roster = makeRoster(12, {
      friendPreferences: {
        "player-1": ["player-2", "player-3", "player-4"],
        "player-2": ["player-1", "player-5"],
        "player-5": ["player-6"],
        "player-7": ["player-8"],
      },
    });

    const first = allocateCourtSchedule(monday60min, roster);
    const second = allocateCourtSchedule(monday60min, roster);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  // T11b: Regression for the "two members, two timetables" incident. The same
  // roster must produce the same timetable no matter what order the database
  // returned the rows in.
  it("is independent of roster and friend-list order", () => {
    const friendPreferences: Record<string, string[]> = {
      "player-1": ["player-2", "player-3", "player-4"],
      "player-2": ["player-1", "player-5"],
      "player-5": ["player-6"],
      "player-7": ["player-8"],
    };
    const forward = makeRoster(12, { friendPreferences });
    const backward = [...forward].reverse().map((player) => ({
      ...player,
      friendIds: [...(player.friendIds ?? [])].reverse(),
    }));
    const orderSession = { ...monday60min, id: "order" };

    const first = allocateCourtSchedule(orderSession, forward);
    const second = allocateCourtSchedule(orderSession, backward);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
