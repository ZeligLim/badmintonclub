import { describe, expect, it } from "vitest";
import {
  allocateCourtSchedule,
  createPlayerGameSchedule,
  type CourtRosterPlayer,
} from "./court-schedule";
import { runProductionBenchmark } from "./court-schedule.bench";

function makeRoster(
  count: number,
  options?: {
    friendPreferences?: Record<string, string[]>;
    priorities?: Record<string, number>;
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
    });
  }
  return roster;
}

function countGamesPerPlayer(
  schedule: ReturnType<typeof allocateCourtSchedule>,
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

describe("Court Scheduling Algorithm", () => {
  const monday60min = {
    id: "session-monday",
    startsAt: "18:00",
    durationMinutes: 60, // 4 rounds (15 min each)
    courtCount: 2,
  };

  const wednesday120min = {
    id: "session-wednesday",
    startsAt: "18:00",
    durationMinutes: 120, // 8 rounds
    courtCount: 4,
  };

  // T1: Mathematical Capacity & Play Count Bounds (Hard Guarantee)
  it("T1: guarantees mathematical capacity and optimal play distribution for various roster sizes", () => {
    for (const N of [8, 9, 10, 11, 12, 13, 14, 15, 16]) {
      const roster = makeRoster(N);
      const schedule = allocateCourtSchedule(monday60min, roster);
      const gameCounts = countGamesPerPlayer(schedule, roster);

      const counts = Array.from(gameCounts.values());
      const minGames = Math.min(...counts);
      const maxGames = Math.max(...counts);
      const totalSlotsAllocated = counts.reduce((sum, c) => sum + c, 0);

      // Invariant 1: Spread <= 1
      expect(maxGames - minGames).toBeLessThanOrEqual(1);

      // Invariant 2: Total slots match R * min(N, 4 * C)
      const activeSpotsPerRound = Math.min(N, 4 * monday60min.courtCount);
      const expectedTotalSlots = 4 * activeSpotsPerRound;
      expect(totalSlotsAllocated).toBe(expectedTotalSlots);

      // Invariant 3: Base and extra games distribution
      const baseGames = Math.floor(expectedTotalSlots / N);
      const extraGames = expectedTotalSlots % N;
      const actualBaseCount = counts.filter((c) => c === baseGames).length;
      const actualExtraCount = counts.filter((c) => c === baseGames + 1).length;

      expect(actualExtraCount).toBe(extraGames);
      expect(actualBaseCount).toBe(N - extraGames);
    }
  });

  // T2: Under-Capacity Roster (Hard Guarantee)
  it("T2: handles under-capacity rosters where N < 4 players with 0 rests", () => {
    for (const N of [1, 2, 3]) {
      const roster = makeRoster(N);
      const schedule = allocateCourtSchedule(monday60min, roster);
      const gameCounts = countGamesPerPlayer(schedule, roster);

      // Every player must play all 4 rounds
      for (const count of gameCounts.values()) {
        expect(count).toBe(4);
      }
      expect(schedule.length).toBe(4); // 1 court x 4 rounds
    }
  });

  // T3: Single-Round Concurrency (Hard Guarantee)
  it("T3: guarantees all player assignments in any single round are mutually disjoint", () => {
    const roster = makeRoster(12);
    const schedule = allocateCourtSchedule(monday60min, roster);

    const roundTimes = [...new Set(schedule.map((g) => g.startAt))];
    for (const startAt of roundTimes) {
      const roundGames = schedule.filter((g) => g.startAt === startAt);
      const playerIdsInRound = roundGames.flatMap((g) => g.players.map((p) => p.id));
      const uniquePlayerIds = new Set(playerIdsInRound);

      // No player is scheduled on more than 1 court in the same round
      expect(uniquePlayerIds.size).toBe(playerIdsInRound.length);
    }
  });

  // T4: Priority-Based Rest Selection (Hard Guarantee)
  it("T4: prioritizes previous-round resters subject to playing-time fairness", () => {
    const roster = makeRoster(10);
    const schedule = allocateCourtSchedule(monday60min, roster);

    const rounds = [...new Set(schedule.map((g) => g.startAt))];
    const gamesPlayedSoFar = new Map<string, number>(roster.map((p) => [p.id, 0]));

    for (let r = 0; r < rounds.length; r++) {
      const startAt = rounds[r]!;
      const roundGames = schedule.filter((g) => g.startAt === startAt);
      const activeIds = new Set(roundGames.flatMap((g) => g.players.map((p) => p.id)));

      if (r > 0) {
        const prevRoundGames = schedule.filter((g) => g.startAt === rounds[r - 1]);
        const prevActiveIds = new Set(prevRoundGames.flatMap((g) => g.players.map((p) => p.id)));
        const prevResters = roster.filter((p) => !prevActiveIds.has(p.id));

        // For any player u who rested in r-1 and player v who played in r-1:
        // If gamesPlayed[u] <= gamesPlayed[v], then v cannot be selected ahead of u
        for (const u of prevResters) {
          const gamesU = gamesPlayedSoFar.get(u.id)!;
          for (const v of roster) {
            if (prevActiveIds.has(v.id)) {
              const gamesV = gamesPlayedSoFar.get(v.id)!;
              if (gamesU <= gamesV && activeIds.has(v.id)) {
                // If v was selected, u must also have been selected
                expect(activeIds.has(u.id)).toBe(true);
              }
            }
          }
        }
      }

      // Update games played after observing round
      for (const id of activeIds) {
        gamesPlayedSoFar.set(id, gamesPlayedSoFar.get(id)! + 1);
      }
    }
  });

  // T5: Minimal Rest Streaks (Hard Guarantee)
  it("T5: guarantees maximum consecutive rests <= 1 for 10-player Monday session", () => {
    const roster = makeRoster(10);
    const schedule = allocateCourtSchedule(monday60min, roster);

    const rounds = [...new Set(schedule.map((g) => g.startAt))];
    for (const player of roster) {
      const roundsPlayed = rounds.map((startAt) =>
        schedule.some((g) => g.startAt === startAt && g.players.some((p) => p.id === player.id)),
      );

      let consecutiveRest = 0;
      let maxConsecutiveRest = 0;
      for (const played of roundsPlayed) {
        if (!played) {
          consecutiveRest += 1;
          maxConsecutiveRest = Math.max(maxConsecutiveRest, consecutiveRest);
        } else {
          consecutiveRest = 0;
        }
      }

      expect(maxConsecutiveRest).toBeLessThanOrEqual(1);
    }
  });

  // T6: Fairness Independence (Hard Guarantee)
  it("T6: ensures friend preferences do not alter each player's total games played", () => {
    const plainRoster = makeRoster(10);
    const plainSchedule = allocateCourtSchedule(monday60min, plainRoster);
    const plainCounts = countGamesPerPlayer(plainSchedule, plainRoster);

    // Add dense friend preferences
    const friendPreferences: Record<string, string[]> = {
      "player-1": ["player-2", "player-3", "player-4"],
      "player-2": ["player-1", "player-3"],
      "player-5": ["player-6"],
      "player-7": ["player-8"],
    };
    const rosterWithFriends = makeRoster(10, { friendPreferences });
    const friendSchedule = allocateCourtSchedule(monday60min, rosterWithFriends);
    const friendCounts = countGamesPerPlayer(friendSchedule, rosterWithFriends);

    // Each player must have the exact same total games played
    for (const player of plainRoster) {
      expect(friendCounts.get(player.id)).toBe(plainCounts.get(player.id));
    }
  });

  // T7: Overlapping Preferences Scenario (Best-Effort Scenario-Specific Optimality)
  it("T7: optimizes overlapping friend preferences scenario (A->BCD, B->CEF, C->ABG) achieving 6 satisfied edges", () => {
    // 8 players on 2 courts (all active in round 0)
    const friendPreferences: Record<string, string[]> = {
      "player-1": ["player-2", "player-3", "player-4"], // A -> B, C, D
      "player-2": ["player-3", "player-5", "player-6"], // B -> C, E, F
      "player-3": ["player-1", "player-2", "player-7"], // C -> A, B, G
    };
    const roster = makeRoster(8, { friendPreferences });
    const schedule = allocateCourtSchedule(
      { id: "test", startsAt: "18:00", durationMinutes: 15, courtCount: 2 },
      roster,
    );

    // Count satisfied directed edges on Court 1 and Court 2
    let totalSatisfied = 0;
    for (const game of schedule) {
      const playerIds = new Set(game.players.map((p) => p.id));
      for (const player of game.players) {
        for (const fid of player.friendIds ?? []) {
          if (playerIds.has(fid)) {
            totalSatisfied += 1;
          }
        }
      }
    }

    // The mathematical maximum for this scenario is 6 satisfied edges
    expect(totalSatisfied).toBe(6);
  });

  // T8: Isolated Friend Pair (Best-Effort Priority)
  it("T8: places an isolated friend pair on the same court when both are active", () => {
    const friendPreferences: Record<string, string[]> = {
      "player-1": ["player-2"],
      "player-2": ["player-1"],
    };
    const roster = makeRoster(8, { friendPreferences });
    const schedule = allocateCourtSchedule(
      { id: "test", startsAt: "18:00", durationMinutes: 15, courtCount: 2 },
      roster,
    );

    const game1 = schedule.find((g) => g.players.some((p) => p.id === "player-1"));
    expect(game1).toBeDefined();
    expect(game1?.players.some((p) => p.id === "player-2")).toBe(true);
  });

  // T9: Full Friend Group of 4 (Best-Effort Priority)
  it("T9: keeps a 4-player friend group together on the same court", () => {
    const friendPreferences: Record<string, string[]> = {
      "player-1": ["player-2", "player-3", "player-4"],
      "player-2": ["player-1", "player-3", "player-4"],
      "player-3": ["player-1", "player-2", "player-4"],
      "player-4": ["player-1", "player-2", "player-3"],
    };
    const roster = makeRoster(8, { friendPreferences });
    const schedule = allocateCourtSchedule(
      { id: "test", startsAt: "18:00", durationMinutes: 15, courtCount: 2 },
      roster,
    );

    // All 4 should occupy the exact same court
    const court = schedule.find((g) => g.players.some((p) => p.id === "player-1"));
    expect(court).toBeDefined();
    const courtPlayerIds = new Set(court?.players.map((p) => p.id));
    expect(courtPlayerIds.has("player-1")).toBe(true);
    expect(courtPlayerIds.has("player-2")).toBe(true);
    expect(courtPlayerIds.has("player-3")).toBe(true);
    expect(courtPlayerIds.has("player-4")).toBe(true);
  });

  // T10: Doubles Variety within Friends (Best-Effort Priority)
  it("T10: rotates doubles partnerships among 4 friends playing across 3 rounds", () => {
    const friendPreferences: Record<string, string[]> = {
      "player-1": ["player-2", "player-3", "player-4"],
      "player-2": ["player-1", "player-3", "player-4"],
      "player-3": ["player-1", "player-2", "player-4"],
      "player-4": ["player-1", "player-2", "player-3"],
    };
    // 4 players on 1 court for 3 rounds (45 minutes)
    const roster = makeRoster(4, { friendPreferences });
    const schedule = allocateCourtSchedule(
      { id: "test", startsAt: "18:00", durationMinutes: 45, courtCount: 1 },
      roster,
    );

    const partnerPairsSeen = new Set<string>();
    for (const game of schedule) {
      expect(game.teamA).toBeDefined();
      expect(game.teamB).toBeDefined();
      const pairA = [game.teamA![0].id, game.teamA![1].id].sort().join("-");
      const pairB = [game.teamB![0].id, game.teamB![1].id].sort().join("-");
      partnerPairsSeen.add(pairA);
      partnerPairsSeen.add(pairB);
    }

    // Over 3 rounds with 4 players, there are exactly 3 distinct partner pairings for player-1:
    // (P1-P2), (P1-P3), (P1-P4).
    // All 3 pairings should be unique with 0 repeated partnerships!
    expect(partnerPairsSeen.size).toBe(6); // 2 pairs per round x 3 unique rounds = 6 distinct team entries
  });

  // T11: Deterministic Reproducibility (Hard Guarantee)
  it("T11: produces 100% identical JSON schedules across repeated runs with identical input", () => {
    const friendPreferences: Record<string, string[]> = {
      "player-1": ["player-2", "player-3"],
      "player-5": ["player-6"],
      "player-10": ["player-11", "player-12"],
    };
    const roster = makeRoster(20, { friendPreferences });

    const scheduleA = allocateCourtSchedule(wednesday120min, roster);
    const scheduleB = allocateCourtSchedule(wednesday120min, roster);

    expect(JSON.stringify(scheduleA)).toBe(JSON.stringify(scheduleB));
  });

  // Extra Test: createPlayerGameSchedule integration
  it("creates accurate player personal game timetable with court companions", () => {
    const roster = makeRoster(10);
    const playerGames = createPlayerGameSchedule(monday60min, roster, "player-1");

    expect(playerGames.length).toBeGreaterThanOrEqual(3);
    for (const game of playerGames) {
      expect(game.courtNumber).toBeGreaterThanOrEqual(1);
      expect(game.courtPlayers.length).toBe(3); // 3 other players on court
      expect(game.courtPlayers).not.toContain("Player 1");
    }
  });

  // Benchmark Verification: Wednesday scale 40 players, 4 courts, 8 rounds
  it("benchmarks complete 8-round Wednesday schedule lifecycle", () => {
    runProductionBenchmark();
  });
});
