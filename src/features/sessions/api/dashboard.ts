import "server-only";

import { addMinutesToTime, getUpcomingSchedule } from "@/lib/sessions/schedule";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type {
  ClubSession,
  DashboardData,
  FriendCandidate,
  SessionSignupStatus,
  SessionStatus,
} from "../types";
import { getCourtCount } from "../court-schedule";

type DashboardSessionRow =
  Database["public"]["Functions"]["get_dashboard_sessions"]["Returns"][number];
type RosterRow =
  Database["public"]["Functions"]["get_session_roster"]["Returns"][number];
type FriendCandidateRow =
  Database["public"]["Functions"]["get_session_friend_preferences"]["Returns"][number];

export async function loadDashboardData(): Promise<DashboardData> {
  if (!hasSupabaseConfig()) {
    throw new Error(
      "Supabase is not configured. Use /dev for local demo data or set the Supabase URL and public key.",
    );
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") {
    throw new Error(`Could not load your sign-in status: ${authError.message}`);
  }
  const user =
    authData.user?.email && /^[^@\s]+@atu\.ie$/i.test(authData.user.email)
      ? authData.user
      : null;

  const { error: ensureError } = await supabase.rpc("ensure_next_week_sessions");
  if (ensureError) {
    throw new Error(`Could not prepare upcoming sessions: ${ensureError.message}`);
  }

  const schedule = getUpcomingSchedule();
  const { data: sessionRows, error: sessionsError } = await supabase.rpc(
    "get_dashboard_sessions",
    {
      p_from_date: schedule.sessions[0].date,
      p_through_date: schedule.sessions[schedule.sessions.length - 1].date,
    },
  );
  if (sessionsError) {
    throw new Error(`Could not load club sessions: ${sessionsError.message}`);
  }

  const rosterRows = user
    ? await getRosterRows(supabase, sessionRows)
    : [];
  const friendCandidates: Map<string, FriendCandidate[]> = user
    ? await getFriendPreferences(supabase, sessionRows)
    : new Map();
  const profile = user
    ? await getProfile(supabase, user.id)
    : null;

  return {
    mode: "live",
    user: user
      ? {
          id: user.id,
          displayName:
            profile?.display_name ??
            user.email?.split("@")[0] ??
            "Player",
          playerLevel: parsePlayerLevel(profile?.player_level ?? "INTERMEDIATE"),
          canChooseProfessional: profile?.can_choose_professional ?? false,
          isCommittee: profile?.is_committee ?? false,
          isCommitteeAdmin: profile?.is_committee_admin ?? false,
          committeeAutoSignup: profile?.committee_auto_signup ?? false,
        }
      : null,
    sessions: sessionRows.map((row) =>
      mapSession(row, rosterRows, friendCandidates.get(row.id) ?? []),
    ),
  };
}

async function getProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "display_name, player_level, can_choose_professional, is_committee, is_committee_admin, committee_auto_signup",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load your profile: ${error.message}`);
  }

  return data;
}

async function getFriendPreferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessions: DashboardSessionRow[],
): Promise<Map<string, FriendCandidate[]>> {
  const openSessions = sessions.filter((session) => session.status === "open");
  const candidateRows = await Promise.all(
    openSessions.map(async (session) => {
      const { data, error } = await supabase.rpc("get_session_friend_preferences", {
        p_session_id: session.id,
      });
      if (error) {
        throw new Error(`Could not load saved friend choices: ${error.message}`);
      }
      return [session.id, data] as const;
    }),
  );

  return new Map(
    candidateRows.map(([sessionId, candidates]) => [
      sessionId,
      candidates.map(mapFriendCandidate),
    ]),
  );
}

async function getRosterRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessions: DashboardSessionRow[],
): Promise<RosterRow[]> {
  const confirmedSessions = sessions.filter(
    (session) => session.status === "confirmed",
  );
  const rosters = await Promise.all(
    confirmedSessions.map((session) =>
      supabase.rpc("get_session_roster", { p_session_id: session.id }),
    ),
  );

  for (const roster of rosters) {
    if (roster.error) {
      throw new Error(`Could not load the confirmed player roster: ${roster.error.message}`);
    }
  }

  return rosters.flatMap((roster) => roster.data ?? []);
}

function mapSession(
  row: DashboardSessionRow,
  rosterRows: RosterRow[],
  friendCandidates: FriendCandidate[],
): ClubSession {
  const dayName = getDayName(row.day_name);
  const status = getSessionStatus(row.status);
  const sessionRoster = rosterRows.filter((player) => player.session_id === row.id);
  const timeSlots =
    status === "confirmed"
      ? Array.from({ length: Math.ceil(sessionRoster.length / 4) }, (_, index) => {
          const number = index + 1;
          const slotDurationMinutes =
            row.duration_minutes / Math.ceil(row.capacity / 4);
          return {
            number,
            startAt: addMinutesToTime(
              row.starts_at,
              index * slotDurationMinutes,
            ),
            players: sessionRoster
              .filter((player) => player.slot_number === number)
              .map((player) => ({
                id: player.user_id,
                displayName: player.display_name,
              })),
          };
        })
      : [];

  return {
    id: row.id,
    date: row.event_date,
    dayName,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    courtCount: getCourtCount(row.capacity),
    capacity: row.capacity,
    registeredCount: row.registered_count,
    playersPerSlot: 4,
    signupOpensAt: row.signup_opens_at,
    confirmationAt: row.confirmation_at,
    status,
    currentUserStatus: getSignupStatus(row.current_user_status),
    currentUserSlot: row.current_user_slot,
    friendCandidates,
    timeSlots,
  };
}

function mapFriendCandidate(row: FriendCandidateRow): FriendCandidate {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    studentId: row.student_id,
    playerLevel: parsePlayerLevel(row.player_level),
    isSelected: row.is_selected,
  };
}

function parsePlayerLevel(playerLevel: string): FriendCandidate["playerLevel"] {
  if (
    playerLevel === "BEGINNER" ||
    playerLevel === "INTERMEDIATE" ||
    playerLevel === "PROFESSIONAL"
  ) {
    return playerLevel;
  }

  throw new Error("A club member has an unsupported player level.");
}

function getDayName(value: string): "Monday" | "Wednesday" {
  if (value === "Monday" || value === "Wednesday") {
    return value;
  }

  throw new Error("The session schedule returned an unsupported weekday.");
}

function getSessionStatus(value: string): SessionStatus {
  if (
    value === "open" ||
    value === "confirmed" ||
    value === "closed" ||
    value === "cancelled"
  ) {
    return value;
  }

  throw new Error("The session schedule returned an unsupported status.");
}

function getSignupStatus(
  value: string | null,
): Exclude<SessionSignupStatus, "cancelled"> | null {
  if (value === null || value === "cancelled") {
    return null;
  }
  if (
    value === "requested" ||
    value === "selected" ||
    value === "waitlisted" ||
    value === "played"
  ) {
    return value;
  }

  throw new Error("Your session signup returned an unsupported status.");
}
