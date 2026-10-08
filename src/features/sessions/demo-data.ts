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
  FriendCandidate,
} from "./types";
import { getCourtCount } from "./court-schedule";
import type { AdminPlayer, AdminSession } from "../admin/data";
import { buildDemoCourtSchedule } from "./demo-court-schedule";

const DEMO_FRIEND_CANDIDATES: FriendCandidate[] = [
  {
    userId: "demo-friend-aoife",
    displayName: "Aoife Murphy",
    studentId: "g00440629",
    playerLevel: "BEGINNER",
    isSelected: false,
  },
  {
    userId: "demo-friend-ciaran",
    displayName: "Ciarán Kelly",
    studentId: "g00440630",
    playerLevel: "INTERMEDIATE",
    isSelected: false,
  },
  {
    userId: "demo-friend-sile",
    displayName: "Síle Brennan",
    studentId: "g00440631",
    playerLevel: "BEGINNER",
    isSelected: false,
  },
  {
    userId: "demo-friend-darragh",
    displayName: "Darragh Quinn",
    studentId: "g00440632",
    playerLevel: "PROFESSIONAL",
    isSelected: false,
  },
];

export const DEFAULT_DEMO_SIGNUP_COUNTS: DemoSignupCounts = {
  Monday: 12,
  Wednesday: 8,
};

// Deterministic fake UUIDs for demo players — version 4 format, fixed values.
const MONDAY_PLAYERS: AdminPlayer[] = [
  { userId: "a1b2c3d4-0001-4000-8000-000000000001", displayName: "Aoife Murphy", status: "selected", slotNumber: 1 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000002", displayName: "Ciarán Kelly", status: "selected", slotNumber: 1 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000003", displayName: "Síle Brennan", status: "selected", slotNumber: 1 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000004", displayName: "Darragh Quinn", status: "selected", slotNumber: 1 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000005", displayName: "Niamh Walsh", status: "selected", slotNumber: 2 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000006", displayName: "Fionn O'Brien", status: "selected", slotNumber: 2 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000007", displayName: "Clodagh Ryan", status: "selected", slotNumber: 2 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000008", displayName: "Seán McCarthy", status: "selected", slotNumber: 2 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000009", displayName: "Róisín Burke", status: "selected", slotNumber: 3 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000010", displayName: "Tadhg Doyle", status: "selected", slotNumber: 3 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000011", displayName: "Aisling Sheridan", status: "selected", slotNumber: 3 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000012", displayName: "Pádraig Lynch", status: "selected", slotNumber: 3 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000013", displayName: "Caoimhe Daly", status: "selected", slotNumber: 4 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000014", displayName: "Eoin Gallagher", status: "selected", slotNumber: 4 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000015", displayName: "Méabh Costello", status: "selected", slotNumber: 4 },
  { userId: "a1b2c3d4-0001-4000-8000-000000000016", displayName: "Cormac Flynn", status: "selected", slotNumber: 4 },
];

const WEDNESDAY_PLAYERS: AdminPlayer[] = [
  { userId: "b2c3d4e5-0002-4000-8000-000000000001", displayName: "Orla Connolly", status: "selected", slotNumber: 1 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000002", displayName: "Rónán Higgins", status: "selected", slotNumber: 1 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000003", displayName: "Sinéad Moran", status: "selected", slotNumber: 1 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000004", displayName: "Fergal Power", status: "selected", slotNumber: 1 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000005", displayName: "Áine Whelan", status: "selected", slotNumber: 2 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000006", displayName: "Cathal Byrne", status: "selected", slotNumber: 2 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000007", displayName: "Muireann Kavanagh", status: "selected", slotNumber: 2 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000008", displayName: "Donagh Smyth", status: "selected", slotNumber: 2 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000009", displayName: "Bríd Farrell", status: "selected", slotNumber: 3 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000010", displayName: "Lorcan Boyle", status: "selected", slotNumber: 3 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000011", displayName: "Sorcha Nolan", status: "selected", slotNumber: 3 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000012", displayName: "Cillian Healy", status: "selected", slotNumber: 3 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000013", displayName: "Grainne Flood", status: "selected", slotNumber: 4 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000014", displayName: "Diarmuid Roche", status: "selected", slotNumber: 4 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000015", displayName: "Catriona Duffy", status: "selected", slotNumber: 4 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000016", displayName: "Oisín Hendrick", status: "selected", slotNumber: 4 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000017", displayName: "Eimear Savage", status: "selected", slotNumber: 5 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000018", displayName: "Tomás Carolan", status: "selected", slotNumber: 5 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000019", displayName: "Nuala Fitzpatrick", status: "selected", slotNumber: 5 },
  { userId: "b2c3d4e5-0002-4000-8000-000000000020", displayName: "Ciarán Timoney", status: "selected", slotNumber: 5 },
  // Waitlisted (20 of 40 places selected; the remaining places are open for FCFS demo)
  { userId: "b2c3d4e5-0002-4000-8000-000000000021", displayName: "Ailbhe Fagan", status: "waitlisted", slotNumber: null },
  { userId: "b2c3d4e5-0002-4000-8000-000000000022", displayName: "Seamus Larkin", status: "waitlisted", slotNumber: null },
];

export function createDemoAdminSessions(now = new Date()): AdminSession[] {
  const schedule = getUpcomingSchedule(now);

  return schedule.sessions.map(({ date }) => {
    const dayName = getSessionDayName(date);
    const isMonday = dayName === "Monday";
    const capacity = isMonday ? 16 : 40;
    const courtCount = getCourtCount(capacity);
    const durationMinutes = isMonday ? 60 : 120;
    const startsAt = isMonday ? "18:00" : "20:00";
    const players = isMonday ? MONDAY_PLAYERS : WEDNESDAY_PLAYERS;
    const selectedPlayers = players.filter(
      (p) => p.status === "selected" || p.status === "played",
    );

    return {
      id: `demo-${dayName.toLowerCase()}-${date}`,
      date,
      dayName,
      startsAt,
      durationMinutes,
      capacity,
      courtCount,
      status: "confirmed" as const,
      availabilityCanChange: true,
      players,
      courtSchedule: buildDemoCourtSchedule(startsAt, durationMinutes, courtCount, selectedPlayers),
    };
  });
}

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

  const capacity = dayName === "Monday" ? 16 : 40;
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
    courtCount: getCourtCount(capacity),
    capacity,
    registeredCount,
    playersPerSlot,
    signupOpensAt,
    confirmationAt: londonDateTime(confirmationDate, 0, 0),
    status: "open",
    currentUserStatus: null,
    currentUserSlot: null,
    friendCandidates: DEMO_FRIEND_CANDIDATES,
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
