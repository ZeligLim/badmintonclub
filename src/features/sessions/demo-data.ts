import { addMinutesToTime, getNextWeekSchedule, londonDateTime } from "@/lib/sessions/schedule";
import type { ClubSession, DashboardData } from "./types";

export function createDemoDashboardData(now = new Date()): DashboardData {
  const schedule = getNextWeekSchedule(now);

  return {
    mode: "demo",
    user: null,
    sessions: [
      createDemoSession(schedule.monday, "Monday", schedule.signupOpensAt, 11),
      createDemoSession(schedule.wednesday, "Wednesday", schedule.signupOpensAt, 8),
    ],
  };
}

function createDemoSession(
  date: string,
  dayName: "Monday" | "Wednesday",
  signupOpensAt: string,
  registeredCount: number,
): ClubSession {
  return {
    id: `demo-${dayName.toLowerCase()}-${date}`,
    date,
    dayName,
    startsAt: "18:00",
    durationMinutes: 120,
    capacity: 16,
    registeredCount,
    playersPerSlot: 4,
    signupOpensAt,
    confirmationAt: londonDateTime(
      new Date(`${date}T12:00:00Z`),
      12,
      0,
    ),
    status: "open",
    currentUserStatus: null,
    currentUserSlot: null,
    timeSlots: Array.from({ length: 4 }, (_, index) => ({
      number: index + 1,
      startAt: addMinutesToTime("18:00", index * 30),
      players: [],
    })),
  };
}
