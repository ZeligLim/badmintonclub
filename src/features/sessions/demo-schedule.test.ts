import { describe, expect, it } from "vitest";
import { getSessionDayName } from "@/lib/sessions/schedule";
import { getDemoSchedule } from "./demo-schedule";

function londonMoment(value: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${partValue("year")}-${partValue("month")}-${partValue("day")} ${partValue("hour")}:${partValue("minute")}`;
}

describe("getSessionDayName", () => {
  it("maps every date to its weekday", () => {
    expect(getSessionDayName("2026-10-19")).toBe("Monday");
    expect(getSessionDayName("2026-10-20")).toBe("Tuesday");
    expect(getSessionDayName("2026-10-21")).toBe("Wednesday");
    expect(getSessionDayName("2026-10-22")).toBe("Thursday");
    expect(getSessionDayName("2026-10-23")).toBe("Friday");
    expect(getSessionDayName("2026-10-24")).toBe("Saturday");
    expect(getSessionDayName("2026-10-25")).toBe("Sunday");
  });
});

describe("getDemoSchedule", () => {
  it("shows the current week from Monday to Wednesday", () => {
    const schedule = getDemoSchedule(new Date("2026-10-19T09:00:00Z"));

    expect(schedule.fromDate).toBe("2026-10-19");
    expect(schedule.sessions.map((session) => session.date)).toEqual([
      "2026-10-19",
      "2026-10-21",
      "2026-10-23",
    ]);
  });

  it("rolls over to the next week from Thursday onwards", () => {
    const schedule = getDemoSchedule(new Date("2026-10-22T09:00:00Z"));

    expect(schedule.fromDate).toBe("2026-10-22");
    expect(schedule.sessions.map((session) => session.date)).toEqual([
      "2026-10-26",
      "2026-10-28",
      "2026-10-30",
    ]);
  });

  it("opens Monday and Wednesday sign-ups on the preceding Thursday", () => {
    const schedule = getDemoSchedule(new Date("2026-10-22T09:00:00Z"));
    const [monday, wednesday, friday] = schedule.sessions;

    expect(londonMoment(monday.signupOpensAt)).toBe("2026-10-22 00:00");
    expect(londonMoment(wednesday.signupOpensAt)).toBe("2026-10-22 00:00");
    expect(londonMoment(friday.signupOpensAt)).toBe("2026-10-24 00:00");
  });

  it("closes sign-ups the day before, or on the day for the Friday session", () => {
    const schedule = getDemoSchedule(new Date("2026-10-22T09:00:00Z"));
    const [monday, wednesday, friday] = schedule.sessions;

    expect(londonMoment(monday.confirmationAt)).toBe("2026-10-25 00:00");
    expect(londonMoment(wednesday.confirmationAt)).toBe("2026-10-27 00:00");
    expect(londonMoment(friday.confirmationAt)).toBe("2026-10-30 14:30");
  });

  it("keeps the Friday session first come, first served and paid", () => {
    const schedule = getDemoSchedule(new Date("2026-10-22T09:00:00Z"));
    const friday = schedule.sessions[2];

    expect(friday.template.allocationMode).toBe("fcfs");
    expect(friday.template.feeCents).toBe(300);
    expect(friday.template.committeeAutoSignup).toBe(false);
  });
});
