import {
  addMinutesToTime,
  getSessionDayName,
  getUpcomingSchedule,
  londonDateTime,
} from "@/lib/sessions/schedule";
import type {
  ClubSession,
  DashboardData,
  DemoSignupCounts,
} from "./types";

export const DEFAULT_DEMO_SIGNUP_COUNTS: DemoSignupCounts = {
  Monday: 12,
  Wednesday: 8,
};

export function createDemoDashboardData(
  now = new Date(),
  signupCounts: DemoSignupCounts = DEFAULT_DEMO_SIGNUP_COUNTS,
): DashboardData {
  const schedule = getUpcomingSchedule(now);

  return {
    mode: "demo",
    user: null,
    sessions: schedule.sessions.map(({ date, signupOpensAt }) => {
      const dayName = getSessionDayName(date);
      const registeredCount = signupCounts[dayName];
      return createDemoSession(date, dayName, signupOpensAt, registeredCount);
    }),
  };
}

function createDemoSession(
  date: string,
  dayName: "Monday" | "Wednesday",
  signupOpensAt: string,
  registeredCount: number,
): ClubSession {
  const confirmationDate = new Date(`${date}T12:00:00Z`);
  confirmationDate.setUTCDate(confirmationDate.getUTCDate() - 1);

  const capacity = dayName === "Monday" ? 16 : 32;
  const playersPerSlot = 4;
  const slotCount = capacity / playersPerSlot;
  const durationMinutes = dayName === "Monday" ? 60 : 120;
  const startsAt = dayName === "Monday" ? "18:00" : "20:00";

  return {
    id: `demo-${dayName.toLowerCase()}-${date}`,
    date,
    dayName,
    startsAt,
    durationMinutes,
    courtCount: capacity / 8,
    capacity,
    registeredCount,
    playersPerSlot,
    signupOpensAt,
    confirmationAt: londonDateTime(confirmationDate, 0, 0),
    status: "open",
    currentUserStatus: null,
    currentUserSlot: null,
    timeSlots: Array.from({ length: slotCount }, (_, index) => ({
      number: index + 1,
      startAt: addMinutesToTime(
        startsAt,
        index * (durationMinutes / slotCount),
      ),
      players: [],
    })),
  };
}
