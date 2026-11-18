import type { PlayerLevel } from "@/types/player";
import type { ClubSessionDay } from "@/lib/sessions/schedule";
import type { PlayerGame as CourtPlayerGame } from "./court-schedule";

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

export type PlayerGame = CourtPlayerGame;

/** One player as they appear on the published timetable. */
export type TimetablePlayer = {
  displayName: string;
  isYou: boolean;
  noShow: boolean;
};

/** One court for one round, as every member sees it. */
export type TimetableGame = {
  courtNumber: number;
  startAt: string;
  endAt: string;
  players: TimetablePlayer[];
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
  playerGameSchedule?: PlayerGame[];
  /**
   * The whole published timetable for this session (every court, every round),
   * shown read-only so members can see who else is playing when.
   */
  fullTimetable?: TimetableGame[];
  /** Version of the saved timetable this page rendered. */
  timetableVersion?: number;
  /** Version this member last acknowledged. */
  timetableSeenVersion?: number;
  /** True when the timetable moved since the member last looked at it. */
  timetableChanged?: boolean;
  /** The member told the club they are not coming after the session started. */
  currentUserNoShow?: boolean;
  /**
   * Set when the database returned a value this build does not understand.
   * The session still renders, with a warning badge, instead of 500ing the page.
   */
  needsAttention?: boolean;
  /** A released timetable was built by an older allocator and needs a repair. */
  timetableOutdated?: boolean;
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
   * The club's clock when this page was rendered. The UI counts from this
   * instead of trusting the visitor's device clock.
   */
  serverNow: string;
  /**
   * When the club week rolls over to the next set of sessions. The dashboard
   * refreshes itself once this moment has passed.
   */
  nextScheduleChangeAt: string | null;
};
