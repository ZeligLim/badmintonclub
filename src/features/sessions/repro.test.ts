import { describe, it } from "vitest";
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
      const duration = c <= 8 ? 15 : 120;
      try {
        allocateCourtSchedule(
          { id: "s", startsAt: "18:00", durationMinutes: duration, courtCount },
          roster,
        );
      } catch (error) {
        console.log("FAIL", "c=" + c, error instanceof Error ? error.message : String(error));
        throw error;
      }
    }
  }, 15_000);
});
