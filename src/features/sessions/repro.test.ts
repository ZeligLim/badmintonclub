import { describe, expect, it } from "vitest";
import { allocateCourtSchedule } from "./court-schedule";

describe("repro", () => {
  it("allocates schedules for full-court rosters up to capacity 40", () => {
    const friendIds = ["player-1", "player-2", "player-3"];
    for (let c = 4; c <= 40; c += 4) {
      const roster = Array.from({ length: c }, (_, i) => ({
        id: `player-${i + 1}`,
        displayName: `Player ${i + 1}`,
        priority: Math.ceil((i + 1) / 4),
        friendIds: i % 4 === 0 ? [friendIds[i % 3]] : [],
        isCommittee: i % 6 === 0,
      }));
      const courtCount = Math.max(1, Math.floor(c / 4));
      try {
        allocateCourtSchedule(
          { id: "s", startsAt: "18:00", durationMinutes: 15, courtCount },
          roster,
        );
      } catch (error) {
        console.log("FAIL", "c=" + c, error instanceof Error ? error.message : String(error));
        throw error;
      }
    }
  }, 15_000);

  it("allocates the confirmed Wednesday roster with overlapping committee requests", () => {
    const roster = [
      { id: "P01", priority: 1, friendIds: ["P02", "outside-1"] },
      { id: "P02", priority: 1, friendIds: ["outside-2"] },
      { id: "P03", priority: 1, friendIds: ["P04", "outside-3"] },
      { id: "P04", priority: 1, friendIds: [] },
      { id: "P05", priority: 2, friendIds: ["P07"], isCommittee: true },
      { id: "P06", priority: 2, friendIds: ["P07", "outside-4"], isCommittee: true },
      {
        id: "P07",
        priority: 2,
        friendIds: ["P05", "P06", "P08", "P14"],
        isCommittee: true,
      },
      { id: "P08", priority: 2, friendIds: ["P05", "P07", "outside-5"], isCommittee: true },
      { id: "P09", priority: 3, friendIds: [] },
      { id: "P10", priority: 3, friendIds: [] },
      { id: "P11", priority: 3, friendIds: [] },
      { id: "P12", priority: 3, friendIds: [] },
      { id: "P13", priority: 4, friendIds: [] },
      { id: "P14", priority: 4, friendIds: [], isCommittee: true },
      { id: "P15", priority: 4, friendIds: [] },
    ].map((player) => ({ ...player, displayName: player.id }));

    const schedule = allocateCourtSchedule(
      { id: "2026-11-04-19:30", startsAt: "19:30", durationMinutes: 120, courtCount: 4 },
      roster,
    );
    expect(schedule).toHaveLength(32);
    expect(schedule.filter((game) => game.courtNumber === 4)).toHaveLength(8);
    expect(schedule.filter((game) => game.courtNumber === 4).every((game) => game.players.length === 3)).toBe(true);
    expect(schedule.filter((game) => game.courtNumber < 4).every((game) => game.players.length === 4)).toBe(true);
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

    const gameCounts = roster.map(
      (player) =>
        schedule.filter((game) => game.players.some((member) => member.id === player.id)).length,
    );
    expect(Math.max(...gameCounts) - Math.min(...gameCounts)).toBe(0);
    for (const startAt of new Set(schedule.map((game) => game.startAt))) {
      const roundPlayers = schedule
        .filter((game) => game.startAt === startAt)
        .flatMap((game) => game.players.map((player) => player.id));
      expect(new Set(roundPlayers).size).toBe(roster.length);
    }
  }, 15_000);
});
