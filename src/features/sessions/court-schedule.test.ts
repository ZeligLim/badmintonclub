import { describe, expect, it } from "vitest";
import {
  allocateCourtSchedule,
  createPlayerGameSchedule,
  type AllocatedCourtGame,
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

/**
 * Builds a roster from an explicit list so that scenarios can name the
 * players they care about.
 */
function makeNamedRoster(
  players: Array<{
    id: string;
    friendIds?: string[];
    priority?: number;
  }>,
): CourtRosterPlayer[] {
  return players.map((player) => ({
    id: player.id,
    displayName: player.id,
    priority: player.priority ?? 1,
    friendIds: player.friendIds ?? [],
  }));
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

function courtOf(
  schedule: AllocatedCourtGame[],
  playerId: string,
): AllocatedCourtGame | undefined {
  return schedule.find((game) => game.players.some((p) => p.id === playerId));
}

function courtPlayerIds(game: AllocatedCourtGame | undefined): string[] {
  return (game?.players ?? []).map((player) => player.id).sort();
}

/**
 * Counts the directed friend requests that end up on the same court.
 */
function countSatisfiedEdges(schedule: AllocatedCourtGame[]): number {
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

/**
 * The rounds of a schedule, in the order they are played.
 */
function roundsOf(schedule: AllocatedCourtGame[]): string[] {
  return [...new Set(schedule.map((game) => game.startAt))].sort();
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

    for (const startAt of roundsOf(schedule)) {
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

    const rounds = roundsOf(schedule);
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

    const rounds = roundsOf(schedule);
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

    // The mathematical maximum for this scenario is 6 satisfied edges
    expect(countSatisfiedEdges(schedule)).toBe(6);
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

    const game = courtOf(schedule, "player-1");
    expect(game).toBeDefined();
    expect(game?.players.some((p) => p.id === "player-2")).toBe(true);
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
    const courtPlayerIds = new Set(
      courtOf(schedule, "player-1")?.players.map((p) => p.id),
    );
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

  // T11: Randomness Only Breaks Ties (docs/court-allocation.md, section 7)
  //
  // The allocation is randomised where the rules leave a choice open, so two
  // runs of the same input may differ. What must not differ is the outcome of
  // a scenario that has no tie to break.
  it("T11: produces identical schedules across repeated runs when there is no tie to break", () => {
    // A single priority-0 anchor with a chain of friends leaves no choice:
    // A -> B -> C -> D is the only possible court.
    const roster = makeNamedRoster([
      { id: "A", friendIds: ["B"], priority: 0 },
      { id: "B", friendIds: ["C"], priority: 5 },
      { id: "C", friendIds: ["D"], priority: 5 },
      { id: "D", priority: 5 },
      { id: "E", priority: 9 },
      { id: "F", priority: 9 },
      { id: "G", priority: 9 },
      { id: "H", priority: 9 },
    ]);
    const session = { id: "test", startsAt: "18:00", durationMinutes: 15, courtCount: 2 };

    const first = JSON.stringify(allocateCourtSchedule(session, roster));
    for (let run = 0; run < 25; run++) {
      expect(JSON.stringify(allocateCourtSchedule(session, roster))).toBe(first);
    }
  });

  // T12: Randomness Never Breaks the Hard Guarantees (docs/court-allocation.md, sections 6 to 8)
  it("T12: keeps every hard guarantee in scenarios that are full of ties", () => {
    const friendPreferences: Record<string, string[]> = {
      "player-1": ["player-2", "player-3", "player-4"],
      "player-2": ["player-3", "player-5", "player-6"],
      "player-3": ["player-1", "player-2", "player-7"],
      "player-4": ["player-1", "player-2"],
      "player-5": ["player-2"],
      "player-6": ["player-1", "player-3"],
      "player-7": ["player-3", "player-8"],
      "player-8": ["player-4", "player-7"],
    };
    const roster = makeRoster(10, { friendPreferences });

    for (let run = 0; run < 40; run++) {
      const schedule = allocateCourtSchedule(monday60min, roster);

      // Every court is full and every player is on at most one court a round.
      for (const game of schedule) {
        expect(game.players).toHaveLength(4);
        expect(new Set(game.players.map((p) => p.id)).size).toBe(4);
      }
      for (const startAt of roundsOf(schedule)) {
        const ids = schedule
          .filter((g) => g.startAt === startAt)
          .flatMap((g) => g.players.map((p) => p.id));
        expect(new Set(ids).size).toBe(ids.length);
      }

      // The number of games is exactly courts x rounds.
      expect(schedule).toHaveLength(monday60min.courtCount * 4);
    }
  });

  // A1: One-Way Friend Requests (docs/court-allocation.md, section 2)
  it("A1: honours a one-way friend request without needing a mutual request", () => {
    const roster = makeNamedRoster([
      { id: "A", friendIds: ["B"] },
      { id: "B" },
      { id: "C" },
      { id: "D" },
      { id: "E" },
      { id: "F" },
      { id: "G" },
      { id: "H" },
    ]);
    const session = { id: "test", startsAt: "18:00", durationMinutes: 15, courtCount: 2 };

    for (let run = 0; run < 25; run++) {
      const schedule = allocateCourtSchedule(session, roster);
      const court = courtOf(schedule, "A");
      expect(court).toBeDefined();
      expect(courtPlayerIds(court)).toContain("B");
    }
  });

  // A2: Anchor Ranking - Committee Precedence (docs/court-allocation.md, section 3)
  it("A2: gives a committee member the contested friend before a non-committee anchor", () => {
    // Both anchors ask for F, so only one of them can have F.
    const roster = makeNamedRoster([
      { id: "COM", friendIds: ["F"], priority: 0 },
      { id: "POP", friendIds: ["F"], priority: 1 },
      { id: "F" },
      { id: "E" },
      { id: "G" },
      { id: "H" },
      { id: "I" },
      { id: "J" },
    ]);
    const session = { id: "test", startsAt: "18:00", durationMinutes: 15, courtCount: 2 };

    for (let run = 0; run < 25; run++) {
      const schedule = allocateCourtSchedule(session, roster);
      expect(courtPlayerIds(courtOf(schedule, "COM"))).toContain("F");
    }
  });

  // A3: Anchor Ranking - Incoming Requests Before Outgoing Ones (docs/court-allocation.md, section 3)
  it("A3: prefers the anchor with more incoming requests over the one with more outgoing requests", () => {
    // P1 has two incoming requests but only one outgoing request; P2 has one
    // incoming request but three outgoing ones. Both ask for F.
    const roster = makeNamedRoster([
      { id: "P1", friendIds: ["F"] },
      { id: "P2", friendIds: ["F", "G", "H"] },
      { id: "P3", friendIds: ["P1"] },
      { id: "P4", friendIds: ["P1"] },
      { id: "F" },
      { id: "G" },
      { id: "H" },
      { id: "I" },
      { id: "J" },
      { id: "K" },
    ]);
    const session = { id: "test", startsAt: "18:00", durationMinutes: 15, courtCount: 2 };

    for (let run = 0; run < 25; run++) {
      const schedule = allocateCourtSchedule(session, roster);
      expect(courtPlayerIds(courtOf(schedule, "P1"))).toContain("F");
    }
  });

  // A4: Anchor Ranking - Outgoing Requests Break The Remaining Tie (docs/court-allocation.md, section 3)
  it("A4: prefers the anchor with more outgoing requests when the incoming counts are equal", () => {
    const roster = makeNamedRoster([
      { id: "P1", friendIds: ["F", "G", "H"] },
      { id: "P2", friendIds: ["F"] },
      { id: "F" },
      { id: "G" },
      { id: "H" },
      { id: "I" },
      { id: "J" },
      { id: "K" },
      { id: "L" },
    ]);
    const session = { id: "test", startsAt: "18:00", durationMinutes: 15, courtCount: 2 };

    for (let run = 0; run < 25; run++) {
      const schedule = allocateCourtSchedule(session, roster);
      expect(courtPlayerIds(courtOf(schedule, "P1"))).toContain("F");
    }
  });

  // A5: Nested Anchors (docs/court-allocation.md, section 5.1)
  it("A5: follows a chain of nested anchors onto one court", () => {
    // A -> B, B -> C, C -> D. Every link in the chain is followed, so the
    // four players share a court.
    const roster = makeNamedRoster([
      { id: "A", friendIds: ["B"], priority: 0 },
      { id: "B", friendIds: ["C"], priority: 5 },
      { id: "C", friendIds: ["D"], priority: 5 },
      { id: "D", priority: 5 },
      { id: "E", priority: 9 },
      { id: "F", priority: 9 },
      { id: "G", priority: 9 },
      { id: "H", priority: 9 },
    ]);
    const session = { id: "test", startsAt: "18:00", durationMinutes: 15, courtCount: 2 };

    for (let run = 0; run < 25; run++) {
      const schedule = allocateCourtSchedule(session, roster);
      expect(courtPlayerIds(courtOf(schedule, "A"))).toEqual([
        "A",
        "B",
        "C",
        "D",
      ]);
    }
  });

  // A6: Two-Person Friendship Pairs (docs/court-allocation.md, section 5.2)
  it("A6: combines two two-person preference pairs into one court", () => {
    const roster = makeNamedRoster([
      { id: "A", friendIds: ["B"] },
      { id: "B" },
      { id: "C", friendIds: ["D"] },
      { id: "D" },
      { id: "E" },
      { id: "F" },
      { id: "G" },
      { id: "H" },
    ]);
    const session = { id: "test", startsAt: "18:00", durationMinutes: 15, courtCount: 2 };

    for (let run = 0; run < 25; run++) {
      const schedule = allocateCourtSchedule(session, roster);
      const court = courtOf(schedule, "A");
      const playerIds = courtPlayerIds(court);
      expect(playerIds).toContain("B");
      expect(playerIds).toContain("C");
      expect(playerIds).toContain("D");
    }
  });

  // A7: Anchor Satisfaction Cycles (docs/court-allocation.md, section 4)
  //
  // B is only ever taken along as somebody else's friend in the first round,
  // because their own friend C is already on another court. Being somebody
  // else's friend does not satisfy an anchor, so B gets their own anchor
  // turn in the next round and plays with C.
  it("A7: keeps an unsatisfied anchor's own friend for a later round", () => {
    const roster = makeNamedRoster([
      { id: "H", friendIds: ["C"], priority: 0 },
      { id: "A", friendIds: ["B"], priority: 1 },
      { id: "B", friendIds: ["C"], priority: 2 },
      { id: "C", friendIds: ["D"], priority: 3 },
      { id: "D", priority: 4 },
      { id: "E", priority: 5 },
      { id: "F", priority: 6 },
      { id: "G", priority: 7 },
    ]);
    const session = { id: "test", startsAt: "18:00", durationMinutes: 30, courtCount: 2 };

    for (let run = 0; run < 25; run++) {
      const schedule = allocateCourtSchedule(session, roster);
      const firstRound = schedule.filter((game) => game.startAt === "18:00");
      const secondRound = schedule.filter((game) => game.startAt === "18:15");

      // C is taken by the leading anchor's court in the first round, so B
      // cannot be with their own friend yet.
      expect(courtPlayerIds(courtOf(firstRound, "C"))).toContain("C");
      expect(courtPlayerIds(courtOf(firstRound, "B"))).not.toContain("C");

      // In the next round B is an unsatisfied anchor and plays with C.
      expect(courtPlayerIds(courtOf(secondRound, "B"))).toContain("C");
    }
  });

  // A8: Game Fairness Is A Hard Constraint (docs/court-allocation.md, section 6)
  it("A8: never gives a player a second game before everyone has had a first", () => {
    const sessions = [
      { session: monday60min, rosterSizes: [9, 10, 12, 16] },
      { session: wednesday120min, rosterSizes: [16, 20, 24] },
    ];

    for (const { session, rosterSizes } of sessions) {
      for (const rosterSize of rosterSizes) {
        const roster = makeRoster(rosterSize);
        const schedule = allocateCourtSchedule(session, roster);
        const gamesPlayed = new Map<string, number>(
          roster.map((player) => [player.id, 0]),
        );

        for (const startAt of roundsOf(schedule)) {
          // Before the round, nobody is more than one game ahead of anybody else.
          const counts = Array.from(gamesPlayed.values());
          expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);

          for (const game of schedule.filter((g) => g.startAt === startAt)) {
            for (const player of game.players) {
              gamesPlayed.set(
                player.id,
                (gamesPlayed.get(player.id) ?? 0) + 1,
              );
            }
          }
        }
      }
    }
  });

  // A9: Requests For Players Who Are Not In The Session (docs/court-allocation.md, section 8:
  // "Never allocate a player who is not available.")
  it("A9: ignores a request for a player who is not in the session", () => {
    const roster = makeNamedRoster([
      { id: "A", friendIds: ["GHOST"] },
      { id: "B" },
      { id: "C" },
      { id: "D" },
    ]);
    const schedule = allocateCourtSchedule(
      { id: "test", startsAt: "18:00", durationMinutes: 15, courtCount: 1 },
      roster,
    );

    expect(schedule).toHaveLength(1);
    expect(schedule[0]!.players).toHaveLength(4);
  });

  // A10: The Allocation Rejects Broken Input
  it("A10: rejects a roster and a session it cannot allocate", () => {
    const session = { id: "test", startsAt: "18:00", durationMinutes: 60, courtCount: 2 };

    expect(() => allocateCourtSchedule(session, [])).toThrow(
      /at least one confirmed player/,
    );
    expect(() =>
      allocateCourtSchedule(session, [
        { id: "A", displayName: "A" },
        { id: "A", displayName: "A again" },
      ]),
    ).toThrow(/duplicate player IDs/);
    expect(() =>
      allocateCourtSchedule({ ...session, durationMinutes: 0 }, makeRoster(4)),
    ).toThrow(/positive whole-number session duration/);
    expect(() =>
      allocateCourtSchedule({ ...session, courtCount: 0 }, makeRoster(4)),
    ).toThrow(/at least one court/);
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
