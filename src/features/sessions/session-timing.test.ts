import { describe, expect, it } from "vitest";
import type { ClubSession } from "./types";
import {
  getSessionPeriod,
  getSessionStartTimestamp,
  getSignupWindowStatus,
  isSessionInProgress,
  isSessionViewVisible,
} from "./session-timing";

function session(overrides: Partial<ClubSession> = {}): ClubSession {
  return {
    id: "session-1",
    date: "2026-11-04",
    startsAt: "19:30",
    durationMinutes: 120,
    capacity: 16,
    signupOpensAt: "2026-10-28T00:00:00Z",
    confirmationAt: "2026-11-03T00:00:00Z",
    status: "open",
    ...overrides,
  } as ClubSession;
}

describe("session start timestamp", () => {
  it("reads a clock time in London time, in GMT", () => {
    expect(getSessionStartTimestamp(session())).toBe(
      Date.parse("2026-11-04T19:30:00Z"),
    );
  });

  it("reads a clock time in London time, in BST", () => {
    expect(
      getSessionStartTimestamp(
        session({ date: "2026-07-15", startsAt: "19:30" }),
      ),
    ).toBe(Date.parse("2026-07-15T18:30:00Z"));
  });

  it("uses an ISO timestamp as-is", () => {
    expect(
      getSessionStartTimestamp(
        session({ startsAt: "2026-11-04T19:30:00Z" }),
      ),
    ).toBe(Date.parse("2026-11-04T19:30:00Z"));
  });

  it("handles a session just after midnight", () => {
    expect(
      getSessionStartTimestamp(
        session({ date: "2026-11-04", startsAt: "00:15" }),
      ),
    ).toBe(Date.parse("2026-11-04T00:15:00Z"));
  });
});

describe("session period", () => {
  const start = Date.parse("2026-11-04T19:30:00Z");
  const end = start + 120 * 60_000;

  it("is upcoming before the start, in progress during, and over at the end", () => {
    expect(getSessionPeriod(session(), new Date(start - 1))).toBe("upcoming");
    expect(getSessionPeriod(session(), new Date(start))).toBe("in-progress");
    expect(getSessionPeriod(session(), new Date(end - 1))).toBe("in-progress");
    expect(getSessionPeriod(session(), new Date(end))).toBe("over");
  });

  it("exposes only in-progress as in progress", () => {
    expect(isSessionInProgress(session(), new Date(start + 1))).toBe(true);
    expect(isSessionInProgress(session(), new Date(start - 1))).toBe(false);
    expect(isSessionInProgress(session(), new Date(end))).toBe(false);
  });

  // Regression: an unparseable date/clock made every comparison false, so a
  // corrupt session looked permanently upcoming.
  it("treats an unparseable start as over instead of upcoming", () => {
    const broken = session({ date: "not-a-date", startsAt: "19:30" });
    expect(getSessionPeriod(broken, new Date("2026-11-04T12:00:00Z"))).toBe(
      "over",
    );
    expect(isSessionViewVisible(broken, new Date("2026-11-04T12:00:00Z"))).toBe(
      false,
    );
  });
});

describe("session view visibility", () => {
  const start = Date.parse("2026-11-04T19:30:00Z");

  it("opens 30 minutes before the start", () => {
    expect(isSessionViewVisible(session(), new Date(start - 30 * 60_000 - 1))).toBe(
      false,
    );
    expect(isSessionViewVisible(session(), new Date(start - 30 * 60_000))).toBe(
      true,
    );
  });

  it("closes when the session is over", () => {
    expect(
      isSessionViewVisible(session(), new Date(start + 120 * 60_000)),
    ).toBe(false);
  });
});

describe("signup window", () => {
  const opens = Date.parse("2026-10-28T00:00:00Z");
  const confirms = Date.parse("2026-11-03T00:00:00Z");

  it("is not open before the window opens", () => {
    expect(getSignupWindowStatus(session(), new Date(opens - 1))).toBe(
      "not-open",
    );
  });

  it("is open from the opening moment until confirmation", () => {
    expect(getSignupWindowStatus(session(), new Date(opens))).toBe("open");
    expect(getSignupWindowStatus(session(), new Date(confirms - 1))).toBe("open");
    expect(getSignupWindowStatus(session(), new Date(confirms))).toBe("closed");
  });

  it("is closed for a session that is not open, whatever the times say", () => {
    for (const status of ["confirmed", "closed", "cancelled"] as const) {
      expect(
        getSignupWindowStatus(session({ status }), new Date(opens + 1)),
      ).toBe("closed");
    }
  });
});
