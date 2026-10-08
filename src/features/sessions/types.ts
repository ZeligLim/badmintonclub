import type { PlayerLevel } from "@/types/player";

export type SessionSignupStatus =
  | "requested"
  | "selected"
  | "waitlisted"
  | "played"
  | "cancelled";

export type SessionStatus = "open" | "confirmed" | "closed" | "cancelled";

export type { PlayerLevel } from "@/types/player";

export type FriendCandidate = {
  userId: string;
  displayName: string;
  studentId: string;
  playerLevel: PlayerLevel;
  isSelected: boolean;
};

export type SessionPlayer = {
  id: string;
  displayName: string;
};

export type SessionTimeSlot = {
  number: number;
  startAt: string;
  players: SessionPlayer[];
};

export type ClubSession = {
  id: string;
  date: string;
  dayName: "Monday" | "Wednesday";
  startsAt: string;
  durationMinutes: number;
  courtCount: number;
  capacity: number;
  registeredCount: number;
  playersPerSlot: number;
  signupOpensAt: string;
  confirmationAt: string;
  status: SessionStatus;
  currentUserStatus: Exclude<SessionSignupStatus, "cancelled"> | null;
  currentUserSlot: number | null;
  friendCandidates: FriendCandidate[];
  timeSlots: SessionTimeSlot[];
};

export type DemoSignupCounts = {
  Monday: number;
  Wednesday: number;
};

export type DashboardData = {
  mode: "demo" | "live";
  user: {
    id: string;
    displayName: string;
    playerLevel: PlayerLevel;
    canChooseProfessional: boolean;
    isCommittee: boolean;
    isCommitteeAdmin: boolean;
    committeeAutoSignup: boolean;
  } | null;
  sessions: ClubSession[];
};
