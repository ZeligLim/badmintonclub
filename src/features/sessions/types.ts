export type SessionSignupStatus =
  | "requested"
  | "selected"
  | "waitlisted"
  | "played"
  | "cancelled";

export type SessionStatus = "open" | "confirmed" | "closed";

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
  capacity: number;
  registeredCount: number;
  playersPerSlot: number;
  signupOpensAt: string;
  confirmationAt: string;
  status: SessionStatus;
  currentUserStatus: Exclude<SessionSignupStatus, "cancelled"> | null;
  currentUserSlot: number | null;
  timeSlots: SessionTimeSlot[];
};

export type DashboardData = {
  mode: "demo" | "live";
  user: { id: string; displayName: string } | null;
  sessions: ClubSession[];
};
