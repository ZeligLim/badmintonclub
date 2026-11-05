import { describe, expect, it } from "vitest";
import {
  allocateCourtSchedule,
  type CourtRosterPlayer,
  type PlayerLevel,
} from "./court-schedule";
import { makeRoster, makeSession } from "./court-schedule.fixtures";

function levelOf(id: string, level: CourtRosterPlayer["level"]): CourtRosterPlayer {
  return { id, displayName: id, level };
}

describe("level matching", () => {
  // T11c: Levels are the final ranking rule after fairness and friendship.
  it("keeps players of the same level on the same court when nothing else decides", () => {
    const roster: CourtRosterPlayer[] = Array.from({ length: 8 }, (_, index) => ({
      id: `player-${index + 1}`,
      displayName: `Player ${index + 1}`,
      level: index % 2 === 0 ? "PROFESSIONAL" : "BEGINNER",
    }));

    const schedule = allocateCourtSchedule(
      makeSession({ id: "levels" }),
      roster,
    );

    for (const game of schedule) {
      expect(new Set(game.players.map((player) => player.level)).size).toBe(1);
    }
  });

  // T11c2: Doubles partners are chosen so their combined level is close.
  it("splits doubles teams so their combined levels are close", () => {
    const roster: CourtRosterPlayer[] = [
      levelOf("beginner-1", "BEGINNER"),
      levelOf("beginner-2", "BEGINNER"),
      levelOf("professional-1", "PROFESSIONAL"),
      levelOf("professional-2", "PROFESSIONAL"),
    ];

    const [game] = allocateCourtSchedule(
      makeSession({ id: "team-levels", courtCount: 1 }),
      roster,
    );

    for (const team of [game!.teamA!, game!.teamB!]) {
      expect(new Set(team.map((player) => player.level))).toEqual(
        new Set(["BEGINNER", "PROFESSIONAL"]),
      );
    }
  });

  it("treats a missing level as intermediate", () => {
    // Two beginners and two intermediate players: the balanced split pairs one
    // beginner with one intermediate on each team.
    const roster: CourtRosterPlayer[] = [
      levelOf("beginner-1", "BEGINNER"),
      levelOf("beginner-2", "BEGINNER"),
      levelOf("intermediate-1", "INTERMEDIATE"),
      { id: "unset", displayName: "unset" },
    ];

    const [game] = allocateCourtSchedule(
      makeSession({ id: "missing-level", courtCount: 1 }),
      roster,
    );

    for (const team of [game!.teamA!, game!.teamB!]) {
      const levels = team.map((player) => player.level ?? "INTERMEDIATE");
      expect(levels.filter((level) => level === "BEGINNER")).toHaveLength(1);
      expect(levels.filter((level) => level === "INTERMEDIATE")).toHaveLength(1);
    }
  });

  // Regression: the old type union listed ADVANCED, and rows written before the
  // level migration can still carry it. An unknown value must not poison the
  // scoring with NaN.
  it("falls back to intermediate for an unrecognised stored level", () => {
    const legacyLevel = "ADVANCED" as unknown as PlayerLevel;
    const effectiveValue = (level: CourtRosterPlayer["level"]) =>
      level === "BEGINNER" ? 1 : level === "PROFESSIONAL" ? 3 : 2;

    const roster: CourtRosterPlayer[] = [
      { id: "legacy", displayName: "legacy", level: legacyLevel },
      { id: "beginner", displayName: "beginner", level: "BEGINNER" },
      { id: "intermediate", displayName: "intermediate", level: "INTERMEDIATE" },
      { id: "professional", displayName: "professional", level: "PROFESSIONAL" },
    ];

    const [game] = allocateCourtSchedule(
      makeSession({ id: "legacy-level", courtCount: 1 }),
      roster,
    );

    expect(game!.players).toHaveLength(4);
    // With the legacy value read as intermediate, the only balanced split is
    // professional + beginner against intermediate + legacy.
    const teamValue = (team: CourtRosterPlayer[]) =>
      team.reduce((sum, player) => sum + effectiveValue(player.level), 0);
    expect(teamValue(game!.teamA!)).toBe(teamValue(game!.teamB!));
  });

  it("does not let level matching break playing-time fairness", () => {
    const roster = makeRoster(12, {
      levels: Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [
          `player-${index + 1}`,
          index < 6 ? "PROFESSIONAL" : "BEGINNER",
        ]),
      ),
    });

    const schedule = allocateCourtSchedule(
      makeSession({ id: "levels-fairness", durationMinutes: 60, courtCount: 2 }),
      roster,
    );

    const counts = roster.map(
      (player) =>
        schedule.filter((game) =>
          game.players.some((member) => member.id === player.id),
        ).length,
    );
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});
