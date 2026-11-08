import { describe, expect, it } from "vitest";
import { allocateCourtSchedule } from "./court-schedule";
import { makeNamedRoster, makeSession } from "./court-schedule.fixtures";

/**
 * These are the two production rosters that once crashed or produced a broken
 * timetable. They are kept as end-to-end shapes rather than unit cases: real
 * capacities, real committee overlap, real remainder court.
 */
describe("regressions", () => {
  it("allocates a full-court roster at every capacity from 4 to 40", () => {
    for (let capacity = 4; capacity <= 40; capacity += 4) {
      const roster = makeRosterOfCapacity(capacity);
      const session = makeSession({
        id: `capacity-${capacity}`,
        durationMinutes: 60,
        courtCount: Math.max(1, Math.floor(capacity / 4)),
      });

      const schedule = allocateCourtSchedule(session, roster);

      expect(schedule).toHaveLength(session.courtCount * 4);
      for (const game of schedule) {
        expect(game.players).toHaveLength(4);
        expect(new Set(game.players.map((player) => player.id)).size).toBe(4);
      }

      // Every player gets the same number of games and plays at most once per round.
      const counts = roster.map(
        (player) =>
          schedule.filter((game) =>
            game.players.some((member) => member.id === player.id),
          ).length,
      );
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      for (const startAt of new Set(schedule.map((game) => game.startAt))) {
        const roundIds = schedule
          .filter((game) => game.startAt === startAt)
          .flatMap((game) => game.players.map((player) => player.id));
        expect(new Set(roundIds).size).toBe(roundIds.length);
      }
    }
    // The sweep allocates ten full evenings with the production candidate count;
    // a two-core build runner needs roughly 20s, so the budget leaves headroom
    // without weakening the coverage.
  }, 90_000);

  it("allocates the confirmed Wednesday roster with overlapping committee requests", () => {
    const roster = makeNamedRoster([
      { id: "P01", friendIds: ["P02", "outside-1"] },
      { id: "P02", friendIds: ["outside-2"] },
      { id: "P03", friendIds: ["P04", "outside-3"] },
      { id: "P04" },
      { id: "P05", friendIds: ["P07"], isCommittee: true },
      { id: "P06", friendIds: ["P07", "outside-4"], isCommittee: true },
      { id: "P07", friendIds: ["P05", "P06", "P08", "P14"], isCommittee: true },
      { id: "P08", friendIds: ["P05", "P07", "outside-5"], isCommittee: true },
      { id: "P09" },
      { id: "P10" },
      { id: "P11" },
      { id: "P12" },
      { id: "P13" },
      { id: "P14", isCommittee: true },
      { id: "P15" },
    ]);

    const session = makeSession({
      id: "2026-11-04-19:30",
      startsAt: "19:30",
      durationMinutes: 120,
      courtCount: 4,
    });

    const schedule = allocateCourtSchedule(session, roster);

    // 15 players over 4 courts: three full courts and one three-player court.
    expect(schedule).toHaveLength(32);
    const remainder = schedule.filter((game) => game.courtNumber === 4);
    expect(remainder).toHaveLength(8);
    expect(remainder.every((game) => game.players.length === 3)).toBe(true);
    expect(
      schedule
        .filter((game) => game.courtNumber < 4)
        .every((game) => game.players.length === 4),
    ).toBe(true);

    // A committee member who asked for friends is never left without one.
    expect(
      schedule.some((game) =>
        game.players.some(
          (player) =>
            player.isCommittee &&
            player.friendIds?.length &&
            !game.players.some((other) => player.friendIds?.includes(other.id)),
        ),
      ),
    ).toBe(false);

    // Everyone plays every round, and everyone plays the same number of games.
    const counts = roster.map(
      (player) =>
        schedule.filter((game) =>
          game.players.some((member) => member.id === player.id),
        ).length,
    );
    expect(Math.max(...counts) - Math.min(...counts)).toBe(0);
    for (const startAt of new Set(schedule.map((game) => game.startAt))) {
      const roundIds = schedule
        .filter((game) => game.startAt === startAt)
        .flatMap((game) => game.players.map((player) => player.id));
      expect(new Set(roundIds).size).toBe(roster.length);
    }
    // The sweep allocates ten full evenings with the production candidate count;
    // a two-core build runner needs roughly 20s, so the budget leaves headroom
    // without weakening the coverage.
  }, 90_000);
});

function makeRosterOfCapacity(capacity: number) {
  const friendPool = ["player-1", "player-2", "player-3"];
  return Array.from({ length: capacity }, (_, index) => ({
    id: `player-${index + 1}`,
    displayName: `Player ${index + 1}`,
    priority: Math.ceil((index + 1) / 4),
    friendIds: index % 4 === 0 ? [friendPool[index % 3]!] : [],
    isCommittee: index % 6 === 0,
  }));
}
