import type { PlayerLevel } from "@/types/player";
import type { ClubSessionDay } from "@/lib/sessions/schedule";

export type SessionSignupStatus =
  | "requested"
  | "selected"
  | "waitlisted"
  | "played"
  | "cancelled";

export type SessionStatus = "open" | "confirmed" | "closed" | "cancelled";

/**
 * How the places in a session are handed out. "lottery" runs the fairness draw
 * when sign-ups close, "fcfs" gives each place to the first player who asked.
 */
export type SessionAllocationMode = "lottery" | "fcfs";

export type { PlayerLevel } from "@/types/player";

export type FriendCandidate = {
  userId: string;
  displayName: string;
  studentId: string;
  playerLevel: PlayerLevel;
  isSelected: boolean;
  isSignedUp?: boolean;
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
  dayName: ClubSessionDay;
  startsAt: string;
  durationMinutes: number;
  courtCount: number;
  capacity: number;
  registeredCount: number;
  playersPerSlot: number;
  signupOpensAt: string;
  confirmationAt: string;
  status: SessionStatus;
  /** Fee charged per player, in cents. */
  feeCents: number;
  allocationMode: SessionAllocationMode;
  currentUserStatus: Exclude<SessionSignupStatus, "cancelled"> | null;
  currentUserSlot: number | null;
  friendCandidates: FriendCandidate[];
  timeSlots: SessionTimeSlot[];
};

export type DemoSignupCounts = Partial<Record<ClubSessionDay, number>>;

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
    friendList: FriendCandidate[];
  } | null;
  sessions: ClubSession[];
  /**
   * When the club week rolls over to the next set of sessions. The dashboard
   * refreshes itself once this moment has passed.
   */
  nextScheduleChangeAt: string | null;
};
