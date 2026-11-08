import { describe, expect, it } from "vitest";
import { makeRoster, makeSession } from "./court-schedule.fixtures";
import {
  getCourtSizes,
  validateSchedule,
} from "./court-schedule.validate";
import type { AllocatedCourtGame } from "./court-schedule.shared";

function game(
  courtNumber: number,
  startAt: string,
  players: string[],
): AllocatedCourtGame {
  const session = makeSession();
  return {
    courtNumber,
    startAt,
    endAt: "20:00",
    players: players.map((id) => ({ id, displayName: id })),
    allocationVersion: 9,
    sessionId: session.id,
  } as AllocatedCourtGame;
}

describe("getCourtSizes", () => {
  it("uses one court for a small roster and four for a full night", () => {
    expect(getCourtSizes(3, 4)).toEqual([3]);
    expect(getCourtSizes(16, 4)).toEqual([4, 4, 4, 4]);
  });

  it("gives the spare court to a three-player remainder", () => {
    expect(getCourtSizes(15, 4)).toEqual([4, 4, 4, 3]);
  });
});

describe("validateSchedule", () => {
  it("accepts a timetable that matches the court sizes and rounds", () => {
    const games = [
      game(1, "19:00", ["a", "b", "c", "d"]),
      game(2, "19:00", ["e", "f", "g", "h"]),
      game(1, "19:15", ["e", "f", "g", "h"]),
      game(2, "19:15", ["a", "b", "c", "d"]),
    ];

    expect(() => validateSchedule(games, [4, 4], 2)).not.toThrow();
  });

  it("rejects the wrong number of games", () => {
    expect(() => validateSchedule([game(1, "19:00", ["a", "b", "c", "d"])], [4, 4], 2)).toThrow(
      /expected 4/i,
    );
  });

  it("rejects a player booked twice in the same round", () => {
    const games = [
      game(1, "19:00", ["a", "b", "c", "d"]),
      game(2, "19:00", ["a", "e", "f", "g"]),
    ];

    expect(() => validateSchedule(games, [4, 4], 1)).toThrow(/more than one court/i);
  });

  it("rejects somebody outside the roster", () => {
    const games = [game(1, "19:00", ["a", "b", "c", "z"])];

    expect(() =>
      validateSchedule(games, [4], 1, new Set(["a", "b", "c", "d"])),
    ).toThrow(/not in the confirmed roster/i);
  });

  it("rejects a duplicate player on one court", () => {
    const games = [game(1, "19:00", ["a", "a", "c", "d"])];

    expect(() => validateSchedule(games, [4], 1)).toThrow(/duplicate/i);
  });
});

describe("scoreAllocation", async () => {
  const { compareScore, scoreAllocation } = await import("./court-schedule.score");

  it("ranks a fair timetable ahead of one that books the same four players twice", () => {
    const session = makeSession();
    const roster = makeRoster(8);
    const fair: AllocatedCourtGame[] = [
      game(1, "19:00", roster.slice(0, 4).map((p) => p.id)),
      game(2, "19:00", roster.slice(4).map((p) => p.id)),
      game(1, "19:15", roster.slice(4).map((p) => p.id)),
      game(2, "19:15", roster.slice(0, 4).map((p) => p.id)),
    ];
    const unfair: AllocatedCourtGame[] = [
      game(1, "19:00", roster.slice(0, 4).map((p) => p.id)),
      game(2, "19:00", roster.slice(0, 4).map((p) => p.id)),
      game(1, "19:15", roster.slice(0, 4).map((p) => p.id)),
      game(2, "19:15", roster.slice(0, 4).map((p) => p.id)),
    ];

    const fairScore = scoreAllocation(session, roster, fair);
    const unfairScore = scoreAllocation(session, roster, unfair);

    expect(compareScore(fairScore, unfairScore)).toBeLessThan(0);
  });
});
