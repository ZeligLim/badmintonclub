import { describe, expect, it } from "vitest";
import { allocateCourtSchedule } from "./court-schedule";
import { makeNamedRoster, makeSession } from "./court-schedule.fixtures";

/**
 * Not part of the normal suite: this measures the cost of the search, so it is
 * opt-in with `RUN_BENCH=1 npm run bench`. The budget is deliberately loose —
 * it catches a tenfold regression, not a slow laptop.
 */
describe.skipIf(!process.env.RUN_BENCH)("allocator performance", () => {
  it("allocates a 15-player, four-court session well under a second", () => {
    const roster = makeNamedRoster(
      Array.from({ length: 15 }, (_, index) => ({
        id: `P${String(index + 1).padStart(2, "0")}`,
        friendIds:
          index < 8 ? [`P${String(index + 2).padStart(2, "0")}`] : [],
        isCommittee: index < 4,
      })),
    );
    const session = makeSession({
      id: "bench-15",
      durationMinutes: 120,
      courtCount: 4,
    });

    const startedAt = performance.now();
    allocateCourtSchedule(session, roster);
    const elapsed = performance.now() - startedAt;

    console.info(`15-player 4-court allocation: ${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(3_000);
  });

  it("allocates a full 40-player session within a few seconds", () => {
    const roster = makeNamedRoster(
      Array.from({ length: 40 }, (_, index) => ({
        id: `P${String(index + 1).padStart(2, "0")}`,
        friendIds:
          index % 4 === 0
            ? [`P${String(((index + 1) % 40) + 1).padStart(2, "0")}`]
            : [],
        isCommittee: index % 6 === 0,
      })),
    );
    const session = makeSession({
      id: "bench-40",
      durationMinutes: 120,
      courtCount: 4,
    });

    const startedAt = performance.now();
    allocateCourtSchedule(session, roster);
    const elapsed = performance.now() - startedAt;

    console.info(`40-player 4-court allocation: ${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(8_000);
  });
});
