import {
  addMinutesToTime,
  getSessionDayName,
  getUpcomingSchedule,
  londonDateTime,
} from "@/lib/sessions/schedule";
import type { ClubSession, DashboardData } from "./types";

export function createDemoDashboardData(now = new Date()): DashboardData {
  const schedule = getUpcomingSchedule(now);

  return {
    mode: "demo",
    user: null,
    sessions: schedule.sessions.map(({ date, signupOpensAt }) => {
      const dayName = getSessionDayName(date);
      const registeredCount = dayName === "Monday" ? 11 : 8;
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

  return {
    id: `demo-${dayName.toLowerCase()}-${date}`,
    date,
    dayName,
    startsAt: dayName === "Monday" ? "18:00" : "20:00",
    durationMinutes: dayName === "Monday" ? 60 : 120,
    capacity: 16,
    registeredCount,
    playersPerSlot: 4,
    signupOpensAt,
    confirmationAt: londonDateTime(confirmationDate, 0, 0),
    status: "open",
    currentUserStatus: null,
    currentUserSlot: null,
    timeSlots: Array.from({ length: 4 }, (_, index) => ({
      number: index + 1,
      startAt: addMinutesToTime(
        dayName === "Monday" ? "18:00" : "20:00",
        index * (dayName === "Monday" ? 15 : 30),
      ),
      players: [],
    })),
  };
}
