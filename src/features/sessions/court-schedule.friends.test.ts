import { describe, expect, it } from "vitest";
import { allocateCourtSchedule } from "./court-schedule";
import {
  countSatisfiedEdges,
  courtOf,
  courtPlayerIds,
  gamesAt,
  makeNamedRoster,
  makeRoster,
  makeSession,
} from "./court-schedule.fixtures";

const twoCourtsOneRound = makeSession({ id: "test" });

describe("friend matching", () => {
  // T7: Overlapping Preferences Scenario
  it("satisfies the maximum number of overlapping friend requests", () => {
    // A -> BCD, B -> CEF, C -> ABG. The mathematical maximum is 6 edges.
    const roster = makeRoster(8, {
      friendPreferences: {
        "player-1": ["player-2", "player-3", "player-4"],
        "player-2": ["player-3", "player-5", "player-6"],
        "player-3": ["player-1", "player-2", "player-7"],
      },
    });

    const schedule = allocateCourtSchedule(twoCourtsOneRound, roster);
    expect(countSatisfiedEdges(schedule)).toBe(6);
  });

  // T8: Isolated Friend Pair
  it("places an isolated friend pair on the same court", () => {
    const roster = makeRoster(8, {
      friendPreferences: {
        "player-1": ["player-2"],
        "player-2": ["player-1"],
      },
    });

    const game = courtOf(allocateCourtSchedule(twoCourtsOneRound, roster), "player-1");
    expect(game).toBeDefined();
    expect(game?.players.some((player) => player.id === "player-2")).toBe(true);
  });

  it("includes a requested friend when fairness leaves a selection tie", () => {
    const roster = makeRoster(10, {
      friendPreferences: { "player-1": ["player-10"] },
    });

    const schedule = allocateCourtSchedule(twoCourtsOneRound, roster);
    expect(courtPlayerIds(courtOf(schedule, "player-1"))).toContain("player-10");
  });

  it("fills unused court places with players connected to the current friend group", () => {
    const roster = makeNamedRoster([
      { id: "A", friendIds: ["B"], isCommittee: true },
      { id: "B" },
      { id: "C", friendIds: ["A"] },
      { id: "D", friendIds: ["B"] },
      { id: "E" },
      { id: "F" },
      { id: "G" },
      { id: "H" },
    ]);

    const schedule = allocateCourtSchedule(twoCourtsOneRound, roster);
    expect(courtPlayerIds(courtOf(schedule, "A"))).toEqual(["A", "B", "C", "D"]);
  });

  // T9: Full Friend Group of 4
  it("keeps a four-player friend group together on the same court", () => {
    const roster = makeRoster(8, {
      friendPreferences: {
        "player-1": ["player-2", "player-3", "player-4"],
        "player-2": ["player-1", "player-3", "player-4"],
        "player-3": ["player-1", "player-2", "player-4"],
        "player-4": ["player-1", "player-2", "player-3"],
      },
    });

    const schedule = allocateCourtSchedule(twoCourtsOneRound, roster);
    expect(courtPlayerIds(courtOf(schedule, "player-1"))).toEqual([
      "player-1",
      "player-2",
      "player-3",
      "player-4",
    ]);
  });

  // T10: Doubles variety within friends.
  it("rotates doubles partnerships instead of repeating them", () => {
    const roster = makeRoster(4, {
      friendPreferences: {
        "player-1": ["player-2", "player-3", "player-4"],
        "player-2": ["player-1", "player-3", "player-4"],
        "player-3": ["player-1", "player-2", "player-4"],
        "player-4": ["player-1", "player-2", "player-3"],
      },
    });

    const schedule = allocateCourtSchedule(
      makeSession({ id: "test", durationMinutes: 45, courtCount: 1 }),
      roster,
    );

    const partnerPairs = new Set<string>();
    for (const game of schedule) {
      expect(game.teamA).toBeDefined();
      expect(game.teamB).toBeDefined();
      partnerPairs.add([game.teamA![0].id, game.teamA![1].id].sort().join("-"));
      partnerPairs.add([game.teamB![0].id, game.teamB![1].id].sort().join("-"));
    }

    // Three rounds of four players yields every pairing exactly once.
    expect(partnerPairs.size).toBe(6);
  });

  // A1: One-Way Friend Requests (docs/court-allocation.md, section 2)
  it("honours a one-way friend request without a mutual request", () => {
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

    for (let run = 0; run < 2; run++) {
      const schedule = allocateCourtSchedule(twoCourtsOneRound, roster);
      expect(courtPlayerIds(courtOf(schedule, "A"))).toContain("B");
    }
  });

  // A2: Anchor Ranking — Committee Precedence (section 3)
  it("gives a committee member the contested friend before a non-committee anchor", () => {
    // Both anchors ask for F, so only one of them can have F.
    const roster = makeNamedRoster([
      { id: "COM", friendIds: ["F"], isCommittee: true },
      { id: "POP", friendIds: ["F"], priority: 0 },
      { id: "F" },
      { id: "E" },
      { id: "G" },
      { id: "H" },
      { id: "I" },
      { id: "J" },
    ]);

    for (let run = 0; run < 2; run++) {
      const schedule = allocateCourtSchedule(twoCourtsOneRound, roster);
      expect(courtPlayerIds(courtOf(schedule, "COM"))).toContain("F");
    }
  });

  it("keeps all three of a committee member's requested friends on court", () => {
    const roster = makeNamedRoster([
      { id: "COM", friendIds: ["A", "B", "C"], isCommittee: true },
      { id: "A" },
      { id: "B" },
      { id: "C" },
      { id: "D" },
      { id: "E" },
      { id: "F" },
      { id: "G" },
      { id: "H" },
    ]);

    const schedule = allocateCourtSchedule(
      makeSession({
        id: "committee-friend-partner",
        durationMinutes: 60,
        courtCount: 2,
      }),
      roster,
    );
    const committeeGames = schedule.filter((game) =>
      game.players.some((player) => player.id === "COM"),
    );

    expect(committeeGames).toHaveLength(4);
    for (const game of committeeGames) {
      expect(courtPlayerIds(game)).toEqual(["A", "B", "C", "COM"]);
    }
  });

  it("fills the remaining court place with a nested friend request for committee", () => {
    const roster = makeNamedRoster([
      { id: "COM", friendIds: ["A", "B"], isCommittee: true },
      { id: "A", friendIds: ["C"] },
      { id: "B" },
      { id: "C" },
      { id: "D" },
      { id: "E" },
      { id: "F" },
      { id: "G" },
      { id: "H" },
    ]);

    const schedule = allocateCourtSchedule(
      makeSession({
        id: "committee-nested-friend",
        durationMinutes: 60,
        courtCount: 2,
      }),
      roster,
    );
    const committeeGames = schedule.filter((game) =>
      game.players.some((player) => player.id === "COM"),
    );

    expect(committeeGames).toHaveLength(4);
    for (const game of committeeGames) {
      expect(courtPlayerIds(game)).toEqual(["A", "B", "C", "COM"]);
    }
  });

  // A5: Nested Anchors (section 5.1)
  it("follows a chain of nested anchors onto one court", () => {
    // A -> B, B -> C, C -> D.
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

    for (let run = 0; run < 2; run++) {
      const schedule = allocateCourtSchedule(twoCourtsOneRound, roster);
      expect(courtPlayerIds(courtOf(schedule, "A"))).toEqual([
        "A",
        "B",
        "C",
        "D",
      ]);
    }
  });

  // A6: Two-Person Friendship Pairs (section 5.2)
  it("combines two two-person preference pairs into one court", () => {
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

    for (let run = 0; run < 2; run++) {
      const schedule = allocateCourtSchedule(twoCourtsOneRound, roster);
      const playerIds = courtPlayerIds(courtOf(schedule, "A"));
      expect(playerIds).toContain("B");
      expect(playerIds).toContain("C");
      expect(playerIds).toContain("D");
    }
  });

  // A7: Committee pack priority and compatible friend requests.
  it("fits a competing friend request into the committee's nested friend pack", () => {
    const roster = makeNamedRoster([
      { id: "H", friendIds: ["C"], isCommittee: true },
      { id: "A", friendIds: ["B"], priority: 1 },
      { id: "B", friendIds: ["C"], priority: 2 },
      { id: "C", friendIds: ["D"], priority: 3 },
      { id: "D", priority: 4 },
      { id: "E", priority: 5 },
      { id: "F", priority: 6 },
      { id: "G", priority: 7 },
    ]);
    const session = makeSession({ id: "test", durationMinutes: 30, courtCount: 2 });

    for (let run = 0; run < 2; run++) {
      const schedule = allocateCourtSchedule(session, roster);
      const firstRound = gamesAt(schedule, "18:00");
      const secondRound = gamesAt(schedule, "18:15");

      // The committee's direct and nested requests take priority, while the
      // fourth court place also fits B, who requested C.
      expect(courtPlayerIds(courtOf(firstRound, "C"))).toContain("C");
      expect(courtPlayerIds(courtOf(firstRound, "H"))).toEqual([
        "B",
        "C",
        "D",
        "H",
      ]);
      expect(courtPlayerIds(courtOf(secondRound, "H"))).toEqual([
        "B",
        "C",
        "D",
        "H",
      ]);
    }
  });

  // A9: Requests for players who are not in the session (section 8).
  it("ignores a request for a player who is not in the session", () => {
    const roster = makeNamedRoster([
      { id: "A", friendIds: ["GHOST"] },
      { id: "B" },
      { id: "C" },
      { id: "D" },
    ]);

    const schedule = allocateCourtSchedule(
      makeSession({ id: "test", courtCount: 1 }),
      roster,
    );

    expect(schedule).toHaveLength(1);
    expect(schedule[0]!.players).toHaveLength(4);
  });
});
