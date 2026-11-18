import { describe, expect, it } from "vitest";
import {
  COURT_ALLOCATION_VERSION,
  type CourtRosterPlayer,
  type PersistedCourtGame,
  allocateCourtSchedule,
  createPlayerGameSchedule,
  getCourtCount,
  getPlayerGamesFromCourtSchedule,
  isCurrentPersistedCourtSchedule,
  isPersistedCourtSchedule,
  isSessionTimetableLocked,
  markCourtScheduleCurrent,
  shouldRefreshPersistedCourtSchedule,
} from "./court-schedule";
import { makeRoster, monday60min } from "./court-schedule.fixtures";
import { buildSessionTimetable } from "./timetable-plan";

const novemberSession = { eventDate: "2026-11-04", startsAt: "19:30" };
const julySession = { eventDate: "2026-07-15", startsAt: "19:30" };

function savedSchedule() {
  return markCourtScheduleCurrent(
    allocateCourtSchedule(monday60min, makeRoster(8)),
  );
}

describe("timetable release lock", () => {
  it("locks exactly 15 minutes before the start, in GMT", () => {
    // London is UTC in November, so 19:30 local is 19:30Z.
    expect(
      isSessionTimetableLocked(novemberSession, new Date("2026-11-04T19:14:59Z")),
    ).toBe(false);
    expect(
      isSessionTimetableLocked(novemberSession, new Date("2026-11-04T19:15:00Z")),
    ).toBe(true);
    expect(
      isSessionTimetableLocked(novemberSession, new Date("2026-11-04T19:31:00Z")),
    ).toBe(true);
  });

  it("locks exactly 15 minutes before the start, in BST", () => {
    // London is UTC+1 in July, so 19:30 local is 18:30Z.
    expect(
      isSessionTimetableLocked(julySession, new Date("2026-07-15T18:14:59Z")),
    ).toBe(false);
    expect(
      isSessionTimetableLocked(julySession, new Date("2026-07-15T18:15:00Z")),
    ).toBe(true);
  });

  it("accepts an ISO timestamp instead of a clock time", () => {
    const iso = { eventDate: "2026-11-04", startsAt: "2026-11-04T19:30:00Z" };
    expect(isSessionTimetableLocked(iso, new Date("2026-11-04T19:14:00Z"))).toBe(
      false,
    );
    expect(isSessionTimetableLocked(iso, new Date("2026-11-04T19:15:00Z"))).toBe(
      true,
    );
  });

  // Regression: an unparseable start used to mean "not released", so a corrupt
  // row could be rewritten after players had already seen it. Fail closed.
  it("treats an unparseable start as released so a bad row is never rewritten", () => {
    expect(
      isSessionTimetableLocked(
        { eventDate: "2026-11-04", startsAt: "not-a-time" },
        new Date("2026-11-04T12:00:00Z"),
      ),
    ).toBe(true);
    expect(
      isSessionTimetableLocked(
        { eventDate: "not-a-date", startsAt: "19:30" },
        new Date("2026-11-04T12:00:00Z"),
      ),
    ).toBe(true);
  });
});

describe("refresh decisions", () => {
  it("builds a timetable when none is saved, even after release", () => {
    expect(shouldRefreshPersistedCourtSchedule(null, { isLocked: true })).toBe(
      true,
    );
    expect(
      shouldRefreshPersistedCourtSchedule(undefined, { isLocked: false }),
    ).toBe(true);
  });

  it("keeps a saved private timetable from an older allocator", () => {
    const olderSnapshot = savedSchedule().map((game) => ({
      ...game,
      allocationVersion: 1,
    }));
    expect(
      shouldRefreshPersistedCourtSchedule(olderSnapshot, { isLocked: false }),
    ).toBe(false);
  });

  it("keeps a current private timetable", () => {
    expect(
      shouldRefreshPersistedCourtSchedule(savedSchedule(), { isLocked: false }),
    ).toBe(false);
  });

  it("never rewrites a released or confirmed timetable", () => {
    const olderSnapshot = savedSchedule().map((game) => ({
      ...game,
      allocationVersion: 1,
    }));
    expect(
      shouldRefreshPersistedCourtSchedule(olderSnapshot, { isLocked: true }),
    ).toBe(false);
    expect(
      shouldRefreshPersistedCourtSchedule(olderSnapshot, {
        isLocked: false,
        isConfirmed: true,
      }),
    ).toBe(false);
  });

  it("treats a malformed saved timetable as missing", () => {
    expect(shouldRefreshPersistedCourtSchedule([], { isLocked: false })).toBe(
      true,
    );
    expect(
      shouldRefreshPersistedCourtSchedule({ nope: true }, { isLocked: false }),
    ).toBe(true);
  });
});

describe("persisted schedule shape", () => {
  it("stamps every game with the current allocation version", () => {
    const schedule = allocateCourtSchedule(monday60min, makeRoster(8));
    const saved = markCourtScheduleCurrent(schedule);

    expect(saved).toHaveLength(schedule.length);
    for (const game of saved) {
      expect(game.allocationVersion).toBe(COURT_ALLOCATION_VERSION);
    }
    expect(isCurrentPersistedCourtSchedule(saved)).toBe(true);
    // The unsaved allocation is not versioned yet.
    expect(isCurrentPersistedCourtSchedule(schedule)).toBe(false);
  });

  it("rejects a schedule with any game from an older allocator", () => {
    const saved = savedSchedule();
    const mixed = saved.map((game, index) =>
      index === 0 ? { ...game, allocationVersion: 1 } : game,
    );

    expect(isCurrentPersistedCourtSchedule(mixed)).toBe(false);
    // Still readable: publishing a timetable freezes it.
    expect(isPersistedCourtSchedule(mixed)).toBe(true);
  });

  it("rejects malformed saved timetables", () => {
    for (const value of [
      null,
      undefined,
      "timetable",
      {},
      [],
      [{ courtNumber: 1, startAt: "18:00", endAt: "18:15", players: [] }],
      [{ courtNumber: "1", startAt: "18:00", endAt: "18:15", players: [{ id: "A", displayName: "A" }] }],
      [{ courtNumber: 1, startAt: "18:00", endAt: "18:15", players: [{ id: 1, displayName: "A" }] }],
    ]) {
      expect(isPersistedCourtSchedule(value)).toBe(false);
    }
  });
});

describe("reading a published timetable", () => {
  it("projects exactly the games the player appears in", () => {
    const schedule = savedSchedule();
    const games = getPlayerGamesFromCourtSchedule(schedule, "player-1");

    expect(games.length).toBeGreaterThan(0);
    expect(games).toEqual(
      schedule
        .filter((game) => game.players.some((player) => player.id === "player-1"))
        .map((game) => ({
          courtNumber: game.courtNumber,
          startAt: game.startAt,
          endAt: game.endAt,
          courtPlayers: game.players
            .filter((player) => player.id !== "player-1")
            .map((player) => player.displayName),
        })),
    );
    for (const game of games) {
      expect(game.courtPlayers).toHaveLength(3);
      expect(game.courtPlayers).not.toContain("Player 1");
    }
  });

  it("returns nothing for a player who is not on the timetable", () => {
    expect(getPlayerGamesFromCourtSchedule(savedSchedule(), "ghost")).toEqual([]);
    expect(getPlayerGamesFromCourtSchedule([], "player-1")).toEqual([]);
  });

  it("creates the same personal timetable the allocator would", () => {
    const roster = makeRoster(10, {
      friendPreferences: {
        "player-1": ["player-2", "player-3", "player-4"],
        "player-2": ["player-5"],
        "player-3": ["player-6"],
      },
    });

    const personal = createPlayerGameSchedule(monday60min, roster, "player-1");
    const expected = getPlayerGamesFromCourtSchedule(
      allocateCourtSchedule(monday60min, roster),
      "player-1",
    );

    expect(personal).toEqual(expected);
    expect(personal.length).toBeGreaterThanOrEqual(3);
    for (const game of personal) {
      expect(game.courtNumber).toBeGreaterThanOrEqual(1);
      expect(game.courtPlayers).toHaveLength(3);
    }
  });
});

describe("court count", () => {
  it("derives courts from capacity at eight players per court, capped at four", () => {
    const expected: Array<[number, number]> = [
      [1, 1],
      [4, 1],
      [8, 1],
      [9, 2],
      [16, 2],
      [17, 3],
      [24, 3],
      [25, 4],
      [32, 4],
      [40, 4],
      [64, 4],
    ];

    for (const [capacity, courts] of expected) {
      expect([capacity, getCourtCount(capacity)]).toEqual([capacity, courts]);
    }
  });
});

describe("planning a timetable without writing", () => {
  const session = {
    id: monday60min.id,
    date: "2026-11-09",
    startsAt: monday60min.startsAt,
    durationMinutes: monday60min.durationMinutes,
    capacity: monday60min.courtCount * 8,
    isConfirmed: true,
  };
  const players = makeRoster(8).map((player) => ({
    id: player.id,
    displayName: player.displayName,
    priority: player.priority,
    friendIds: player.friendIds,
    isCommittee: player.isCommittee,
    level: player.level,
  }));

  it("reuses a saved schedule without flagging a write", () => {
    const saved = savedSchedule();
    const plan = buildSessionTimetable({ session, players, persisted: saved });

    expect(plan.games).toEqual(saved);
    expect(plan.needsPersisting).toBe(false);
  });

  it("plans a schedule in memory when none is saved", () => {
    const plan = buildSessionTimetable({ session, players, persisted: null });

    expect(plan.games).toHaveLength(8);
    expect(plan.needsPersisting).toBe(true);
  });

  it("reuses an unlocked schedule built by an older allocator", () => {
    const stale = savedSchedule().map((game) => ({
      ...game,
      allocationVersion: (COURT_ALLOCATION_VERSION - 1) as typeof COURT_ALLOCATION_VERSION,
    }));
    const plan = buildSessionTimetable({
      session: { ...session, date: "2026-12-07", isConfirmed: false },
      players,
      persisted: stale,
    });

    expect(plan.needsPersisting).toBe(false);
    expect(plan.games).toEqual(stale);
  });
});

describe("stale board repair before release", () => {
  const players = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `player-${index + 1}`,
      displayName: `Player ${index + 1}`,
    }));

  const session = {
    id: "session-1",
    date: "2026-11-18",
    startsAt: "19:30",
    durationMinutes: 120,
    capacity: 28,
    courtCount: 3,
    isConfirmed: true,
  };

  const seat = (player: { id: string; displayName: string }): CourtRosterPlayer => ({
    ...player,
    priority: 1,
    friendIds: [],
    isCommittee: false,
    level: null,
  });

  /** A fair board: everyone plays the same number of games. */
  function board(games: number, rosterSize: number): PersistedCourtGame[] {
    const roster = players(rosterSize);
    return Array.from({ length: games }, (_, index) => {
      const line = Array.from({ length: 4 }, (_, offset) =>
        seat(roster[(index * 4 + offset) % rosterSize]),
      );
      return {
        courtNumber: (index % 3) + 1,
        startAt: "19:30",
        endAt: "19:45",
        players: line,
        teamA: [line[0], line[1]],
        teamB: [line[2], line[3]],
        allocationVersion: 9,
      };
    });
  }

  it("rebuilds a saved board whose players no longer match the roster", () => {
    const saved = board(24, 24);
    const roster = players(25); // one member joined after the draw
    const plan = buildSessionTimetable({
      session,
      players: roster,
      persisted: saved,
      now: new Date("2026-11-18T19:00:00Z"),
    });
    expect(plan.needsPersisting).toBe(true);
  });

  it("rebuilds when the court count changed", () => {
    const saved = board(18, 18); // three courts, 6 rounds, everyone plays 4
    const plan = buildSessionTimetable({
      session: { ...session, courtCount: 2 },
      players: players(18),
      persisted: saved,
      now: new Date("2026-11-18T19:00:00Z"),
    });
    expect(plan.needsPersisting).toBe(true);
  });

  it("rebuilds an uneven board even though the session is confirmed", () => {
    const even = board(24, 23);
    let replaced = 0;
    // Same people, different night: player-23 loses two games to player-1.
    const uneven = even.map((game) => ({
      ...game,
      players: game.players.map((player) => {
        if (player.id === "player-23" && replaced < 2) {
          replaced += 1;
          return { ...player, id: "player-1", displayName: "Player 1" };
        }
        return player;
      }),
    }));
    const roster = players(23);
    const plan = buildSessionTimetable({
      session,
      players: roster,
      persisted: uneven,
      now: new Date("2026-11-18T19:00:00Z"),
    });
    expect(plan.needsPersisting).toBe(true);
  });

  it("leaves a released board alone even when it is uneven", () => {
    const saved = board(24, 24);
    const plan = buildSessionTimetable({
      session,
      players: players(23),
      persisted: saved,
      now: new Date("2026-11-18T19:20:00Z"),
    });
    expect(plan.needsPersisting).toBe(false);
    expect(plan.isLocked).toBe(true);
  });

  it("keeps a fair board that matches the night", () => {
    const saved = board(24, 24);
    const plan = buildSessionTimetable({
      session,
      players: players(24),
      persisted: saved,
      now: new Date("2026-11-18T19:00:00Z"),
    });
    expect(plan.needsPersisting).toBe(false);
  });
});
