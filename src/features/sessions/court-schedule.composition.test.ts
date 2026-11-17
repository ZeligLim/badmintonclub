import { describe, expect, it } from "vitest";

import {
  DEFAULT_MATCHING_PRIORITY,
  isMatchingPriority,
  toMatchingPriority,
  type MatchingPriorityKey,
} from "./court-schedule.shared";
import {
  levelCompositionPenalty,
  levelSpreadWithin,
  type PlayerLevel,
} from "./court-schedule.levels";
import { scoreAllocation } from "./court-schedule.score";
import { makeNamedRoster, makeSession } from "./court-schedule.fixtures";
import { allocateCourtSchedule } from "./court-schedule";

const B: PlayerLevel = "BEGINNER";
const I: PlayerLevel = "INTERMEDIATE";
const A: PlayerLevel = "ADVANCED";
const P: PlayerLevel = "PROFESSIONAL";

function penalty(levels: PlayerLevel[]): number {
  return levelCompositionPenalty(levels.map((level) => ({ level })));
}

describe("court composition classes", () => {
  it("ranks the six shapes the club agreed on", () => {
    expect(penalty([I, I, I, I])).toBe(0);
    expect(penalty([I, I, A, A])).toBe(10);
    expect(penalty([I, I, I, B])).toBe(20);
    expect(penalty([I, I, A, B])).toBe(30);
    expect(penalty([B, B, B, A])).toBe(40);
    expect(penalty([B, I, A, P])).toBe(50);
  });

  it("prefers two and two over three intermediates and a beginner", () => {
    // The old sum-of-differences rule scored 2+2 (spread 4) worse than
    // 3 intermediates + 1 beginner (spread 3), which is the shape the club
    // wanted to avoid. The class ordering fixes that.
    expect(penalty([I, I, A, A])).toBeLessThan(penalty([I, I, I, B]));
    expect(levelSpreadWithin([{ level: I }, { level: I }, { level: I }, { level: B }])).toBe(3);
    expect(levelSpreadWithin([{ level: I }, { level: I }, { level: A }, { level: A }])).toBe(4);
  });

  it("does not stranding the strongest player look like the better shape", () => {
    expect(penalty([B, B, B, A])).toBeGreaterThan(penalty([B, B, A, A]));
    expect(penalty([B, B, A, A])).toBe(10);
  });

  it("keeps three-player courts reasonable", () => {
    expect(penalty([I, I, I])).toBe(0);
    expect(penalty([I, I, A])).toBe(25);
    expect(penalty([B, I, A])).toBe(50);
  });
});

describe("matching priority", () => {
  it("accepts only permutations of the three keys", () => {
    expect(isMatchingPriority(["committee", "level", "friends"])).toBe(true);
    expect(isMatchingPriority(["friends", "level", "committee"])).toBe(true);
    expect(isMatchingPriority(["level", "level", "friends"])).toBe(false);
    expect(isMatchingPriority(["committee", "level"])).toBe(false);
    expect(isMatchingPriority(["committee", "level", "friends", "hard"])).toBe(false);
    expect(toMatchingPriority(null)).toEqual(DEFAULT_MATCHING_PRIORITY);
  });

  it("puts the first key's terms directly after fairness", () => {
    const session = makeSession({ durationMinutes: 60, courtCount: 1 });
    const roster = makeNamedRoster([
      { id: "a", level: "INTERMEDIATE", friendIds: ["b"] },
      { id: "b", level: "INTERMEDIATE" },
      { id: "c", level: "ADVANCED" },
      { id: "d", level: "BEGINNER" },
    ]);
    const schedule = allocateCourtSchedule(session, roster, { candidateCount: 1 });

    const levelFirst: MatchingPriorityKey[] = ["level", "committee", "friends"];
    const friendsFirst: MatchingPriorityKey[] = ["friends", "committee", "level"];
    const a = scoreAllocation(session, roster, schedule, levelFirst);
    const b = scoreAllocation(session, roster, schedule, friendsFirst);

    // Index 0 and 1 are the non-negotiable hard rules and fairness.
    expect(a[0]).toBe(0);
    expect(a[1]).toBe(0);
    // Level first: composition penalty at index 2, spread at index 3. A
    // 60-minute session is four rounds, and every round carries the same
    // 2+1+1 court (30) with a spread of 6.
    expect(schedule).toHaveLength(4);
    expect(a[2]).toBe(4 * 30);
    expect(a[3]).toBe(4 * 6);
    // Friends first: the friend terms come first, level moves to the tail.
    expect(b[2]).toBeLessThanOrEqual(0);
    expect(b.length).toBe(a.length);
    expect(b[2]).not.toBe(a[2]);
  });
});
