import { describe, expect, it } from "vitest";
import { allocateCourtSchedule } from "./court-schedule";
import { makeRoster, monday60min } from "./court-schedule.fixtures";

describe("input validation", () => {
  // A10: The allocation rejects broken input.
  it("rejects a roster and a session it cannot allocate", () => {
    expect(() => allocateCourtSchedule(monday60min, [])).toThrow(
      /at least one confirmed player/,
    );

    const duplicateRoster = [
      { id: "A", displayName: "A" },
      { id: "A", displayName: "A again" },
    ];
    expect(() => allocateCourtSchedule(monday60min, duplicateRoster)).toThrow(
      /duplicate player IDs/,
    );

    for (const durationMinutes of [0, -15, 30.5]) {
      expect(() =>
        allocateCourtSchedule({ ...monday60min, durationMinutes }, makeRoster(4)),
      ).toThrow(/positive whole-number session duration/);
    }

    for (const courtCount of [0, -1, 1.5]) {
      expect(() =>
        allocateCourtSchedule({ ...monday60min, courtCount }, makeRoster(4)),
      ).toThrow(/at least one court/);
    }
  });

  it("ignores friend requests that point outside the roster", () => {
    const roster = makeRoster(8, {
      friendPreferences: {
        "player-1": ["ghost", "player-2"],
        "player-3": ["", "player-4"],
      },
    });

    const schedule = allocateCourtSchedule(monday60min, roster);
    expect(schedule.length).toBeGreaterThan(0);
    for (const game of schedule) {
      for (const player of game.players) {
        expect(player.id).not.toBe("ghost");
      }
    }
  });

  it("falls back to the automatic candidate count for a nonsense override", () => {
    for (const candidateCount of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const schedule = allocateCourtSchedule(monday60min, makeRoster(10), {
        candidateCount,
      });
      expect(schedule.length).toBe(monday60min.courtCount * 4);
    }
  });

  it("produces the same timetable for a given seed", () => {
    const roster = makeRoster(12);
    const seed = "2026-11-04";

    expect(
      JSON.stringify(
        allocateCourtSchedule(monday60min, roster, { seed, candidateCount: 5 }),
      ),
    ).toBe(
      JSON.stringify(
        allocateCourtSchedule(monday60min, roster, { seed, candidateCount: 5 }),
      ),
    );
  });
});
