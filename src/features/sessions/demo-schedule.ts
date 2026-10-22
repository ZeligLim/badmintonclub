import {
  CLUB_SESSION_DAYS,
  londonDateTime,
  type ClubSessionDay,
} from "@/lib/sessions/schedule";
import type { SessionAllocationMode } from "./types";

/**
 * The schedule shown in demo mode. It mirrors the club's seeded templates so
 * the demo behaves like the live site, but it never talks to the database.
 */
export type DemoSessionTemplate = {
  day: ClubSessionDay;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  feeCents: number;
  allocationMode: SessionAllocationMode;
  committeeAutoSignup: boolean;
  signupOpensLeadDays: number;
  confirmationLeadDays: number;
  confirmationAt: string;
};

export const DEMO_SESSION_TEMPLATES: DemoSessionTemplate[] = [
  {
    day: "Monday",
    startsAt: "18:00",
    durationMinutes: 60,
    capacity: 16,
    feeCents: 0,
    allocationMode: "lottery",
    committeeAutoSignup: true,
    signupOpensLeadDays: 4,
    confirmationLeadDays: 1,
    confirmationAt: "00:00",
  },
  {
    day: "Wednesday",
    startsAt: "19:30",
    durationMinutes: 120,
    capacity: 40,
    feeCents: 0,
    allocationMode: "lottery",
    committeeAutoSignup: true,
    signupOpensLeadDays: 6,
    confirmationLeadDays: 1,
    confirmationAt: "00:00",
  },
  {
    day: "Friday",
    startsAt: "15:00",
    durationMinutes: 180,
    capacity: 16,
    feeCents: 300,
    allocationMode: "fcfs",
    committeeAutoSignup: false,
    signupOpensLeadDays: 6,
    confirmationLeadDays: 0,
    confirmationAt: "14:30",
  },
];

export type DemoSessionSchedule = {
  fromDate: string;
  sessions: Array<{
    date: string;
    template: DemoSessionTemplate;
    signupOpensAt: string;
    confirmationAt: string;
  }>;
};

export function getDemoSchedule(now = new Date()): DemoSessionSchedule {
  const today = getLondonDate(now);
  const [year, month, day] = today.split("-").map(Number);
  const todayUtc = new Date(Date.UTC(year, month - 1, day));
  // Monday to Wednesday show the current week's sessions. From Thursday
  // onwards the club week rolls over, so next week's sessions are shown.
  const daysFromMonday = (todayUtc.getUTCDay() + 6) % 7;
  const mondayOffset = daysFromMonday <= 2 ? -daysFromMonday : 7 - daysFromMonday;
  const weekStart = addDays(todayUtc, mondayOffset);

  return {
    // Always start from today so any one-off sessions earlier in the week appear.
    fromDate: today,
    sessions: DEMO_SESSION_TEMPLATES.map((template) => {
      const eventDate = addDays(
        weekStart,
        CLUB_SESSION_DAYS.indexOf(template.day),
      );
      const [confirmationHour, confirmationMinute] = template.confirmationAt
        .split(":")
        .map(Number);

      return {
        date: formatDate(eventDate),
        template,
        signupOpensAt: londonDateTime(
          addDays(eventDate, -template.signupOpensLeadDays),
          0,
          0,
        ),
        confirmationAt: londonDateTime(
          addDays(eventDate, -template.confirmationLeadDays),
          confirmationHour,
          confirmationMinute,
        ),
      };
    }),
  };
}

function getLondonDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
