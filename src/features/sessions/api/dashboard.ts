import "server-only";

import {
  addMinutesToTime,
  CLUB_SESSION_DAYS,
  type ClubSessionDay,
} from "@/lib/sessions/schedule";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  ClubSession,
  DashboardData,
  FriendCandidate,
  SessionAllocationMode,
  SessionSignupStatus,
  SessionStatus,
} from "../types";
import {
  allocateCourtSchedule,
  getCourtCount,
  getPlayerGamesFromCourtSchedule,
  isPersistedCourtSchedule,
  markCourtScheduleCurrent,
} from "../court-schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { isClubEmail } from "@/lib/validation";
import { logError } from "@/lib/log";

type DashboardSessionRow =
  Database["public"]["Functions"]["get_dashboard_sessions"]["Returns"][number];
type RosterRow =
  Database["public"]["Functions"]["get_session_roster"]["Returns"][number];
type FriendCandidateRow =
  Database["public"]["Functions"]["get_session_friend_preferences"]["Returns"][number];
type FriendListRow =
  Database["public"]["Functions"]["get_my_friend_list"]["Returns"][number];

export async function loadDashboardData(): Promise<DashboardData> {
  if (!hasSupabaseConfig()) {
    throw new Error(
      "Supabase is not configured. Use /dev for local demo data or set the Supabase URL and public key.",
    );
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError?.message?.includes("does not exist")) {
    await supabase.auth.signOut();
  } else if (authError && authError.name !== "AuthSessionMissingError") {
    logError("Could not load your sign-in status.", authError);
    throw new Error("Could not load your sign-in status.");
  }
  const user = isClubEmail(authData.user?.email) ? authData.user : null;

  const { error: ensureError } = await supabase.rpc("ensure_next_week_sessions");
  if (ensureError) {
    logError("Could not prepare upcoming sessions.", ensureError);
    throw new Error("Could not prepare upcoming sessions.");
  }

  // The window comes from the session templates, so the club week always
  // matches the sessions that are actually published.
  const { data: windowRows, error: windowError } = await supabase.rpc(
    "get_dashboard_window",
  );
  if (windowError) {
    logError("Could not load the club schedule window.", windowError);
    throw new Error("Could not load the club schedule window.");
  }
  const window = windowRows?.[0];
  if (!window) {
    throw new Error("The club schedule window is not available.");
  }
  const fromDate = window.from_date;
  const throughDate = window.through_date;

  const { data: sessionRows, error: sessionsError } = await supabase.rpc(
    "get_dashboard_sessions",
    {
      p_from_date: fromDate,
      p_through_date: throughDate,
    },
  );
  if (sessionsError) {
    logError("Could not load club sessions.", sessionsError);
    throw new Error("Could not load club sessions.");
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
  const friendList = user
    ? await getFriendList(supabase)
    : [];

  const userPlayerGameSchedules = new Map<string, import("../types").PlayerGame[]>();
  if (user) {
    try {
      const admin = createAdminClient();
      const confirmedSessionIds = sessionRows
        .filter((row) => row.status === "confirmed")
        .map((row) => row.id);

      const rosterBySession = new Map<string, RosterRow[]>();
      for (const row of rosterRows) {
        if (row.session_id) {
          const list = rosterBySession.get(row.session_id) ?? [];
          list.push(row);
          rosterBySession.set(row.session_id, list);
        }
      }

      const { data: allFriendPrefs } = confirmedSessionIds.length
        ? await admin
            .from("session_friend_preferences")
            .select("session_id, user_id, friend_user_id")
            .in("session_id", confirmedSessionIds)
        : { data: [] };

      const confirmedRosterUserIds = Array.from(
        new Set(
          rosterRows
            .filter((row) =>
              confirmedSessionIds.includes(row.session_id ?? ""),
            )
            .map((row) => row.user_id)
            .filter((value): value is string => typeof value === "string"),
        ),
      );
      const { data: committeeProfiles } = confirmedRosterUserIds.length
        ? await admin
            .from("profiles")
            .select("id, is_committee, player_level")
            .in("id", confirmedRosterUserIds)
        : { data: [] };
      const committeeByUser = new Map(
        (committeeProfiles ?? []).map((row) => [row.id, row.is_committee]),
      );
      const levelByUser = new Map(
        (committeeProfiles ?? []).map((row) => [
          row.id,
          parsePlayerLevel(row.player_level),
        ]),
      );
      const { data: allClubPrefs } =
        confirmedSessionIds.length && confirmedRosterUserIds.length
          ? await admin
              .from("club_friend_list")
              .select("user_id, friend_user_id")
              .in("user_id", confirmedRosterUserIds)
          : { data: [] };

      // Every viewer reads the same saved timetable. Recomputing a personal
      // timetable here was the source of members seeing different courts.
      const { data: persistedTimetables } = confirmedSessionIds.length
        ? await admin
            .from("session_timetables")
            .select("session_id, court_schedule")
            .in("session_id", confirmedSessionIds)
        : { data: [] };
      const timetableBySession = new Map(
        (persistedTimetables ?? []).map((row) => [
          row.session_id,
          row.court_schedule,
        ]),
      );

      const friendRosterBySession = new Map(
        confirmedSessionIds.map((sessionId) => [
          sessionId,
          new Set(
            (rosterBySession.get(sessionId) ?? []).map((row) => row.user_id),
          ),
        ]),
      );
      for (const pref of allClubPrefs ?? []) {
        if (!pref?.user_id || !pref?.friend_user_id) continue;
        for (const sessionId of confirmedSessionIds) {
          const players = friendRosterBySession.get(sessionId);
          if (!players || !players.has(pref.user_id)) continue;
          (allFriendPrefs ?? []).push({
            session_id: sessionId,
            user_id: pref.user_id,
            friend_user_id: pref.friend_user_id,
          });
        }
      }
      const prefsBySession = new Map<string, Map<string, string[]>>();
      for (const pref of allFriendPrefs ?? []) {
        const sessionMap = prefsBySession.get(pref.session_id) ?? new Map();
        const list = sessionMap.get(pref.user_id) ?? [];
        list.push(pref.friend_user_id);
        sessionMap.set(pref.user_id, list);
        prefsBySession.set(pref.session_id, sessionMap);
      }
      for (const sessionRow of sessionRows.filter((row) => row.status === "confirmed")) {
        const persistedSchedule = timetableBySession.get(sessionRow.id);
        if (isPersistedCourtSchedule(persistedSchedule)) {
          userPlayerGameSchedules.set(
            sessionRow.id,
            getPlayerGamesFromCourtSchedule(persistedSchedule, user.id),
          );
          continue;
        }

        const sessionRoster = rosterBySession.get(sessionRow.id) ?? [];
        const sessionPrefs = prefsBySession.get(sessionRow.id) ?? new Map();
        const rosterPlayers = sessionRoster.map((player) => ({
          id: player.user_id,
          displayName: player.display_name,
          priority: player.slot_number ?? 1,
          friendIds: sessionPrefs.get(player.user_id) ?? [],
          isCommittee: committeeByUser.get(player.user_id) ?? false,
          level: levelByUser.get(player.user_id) ?? "INTERMEDIATE",
        }));
        if (rosterPlayers.length === 0) {
          userPlayerGameSchedules.set(sessionRow.id, []);
          continue;
        }

        const schedule = allocateCourtSchedule(
          {
            id: sessionRow.id,
            startsAt: sessionRow.starts_at,
            durationMinutes: sessionRow.duration_minutes,
            courtCount: getCourtCount(sessionRow.capacity),
          },
          rosterPlayers,
        );
        try {
          await admin
            .from("session_timetables")
            .upsert(
              {
                session_id: sessionRow.id,
                court_schedule: markCourtScheduleCurrent(schedule) as Exclude<
                  Json,
                  null
                >,
                generated_by: null,
                generated_at: new Date().toISOString(),
              },
              { onConflict: "session_id" },
            );
        } catch (persistError) {
          logError("Could not persist the session timetable.", persistError);
        }
        userPlayerGameSchedules.set(
          sessionRow.id,
          getPlayerGamesFromCourtSchedule(schedule, user.id),
        );
      }
    } catch (error) {
      logError("Could not build personalized game schedule.", error);
    }
  }

  return {
    mode: "live",
    serverNow: await getClubNow(supabase),
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
          friendList,
        }
      : null,
    sessions: sessionRows.map((row) =>
      mapSession(
        row,
        rosterRows,
        friendCandidates.get(row.id) ?? [],
        userPlayerGameSchedules.get(row.id) ?? [],
      ),
    ),
    nextScheduleChangeAt: window.next_change_at,
  };
}

/**
 * The club's clock, not the browser's. In development the virtual clock is read
 * here (server-side) so `npm run dev` can still travel in time.
 */
async function getClubNow(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  if (process.env.NODE_ENV !== "development") {
    return new Date().toISOString();
  }

  const { data } = await supabase
    .from("dev_virtual_clock")
    .select("virtual_now")
    .eq("id", 1)
    .maybeSingle();

  return data?.virtual_now ?? new Date().toISOString();
}

async function getFriendList(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<FriendCandidate[]> {
  const { data, error } = await supabase.rpc("get_my_friend_list");
  if (error) {
    logError("Could not load the shared friend list.", {
      code: error.code,
    });
    throw new Error("Could not load your friend list.");
  }

  return data.map((friend: FriendListRow) => ({
    userId: friend.user_id,
    displayName: friend.display_name,
    studentId: friend.student_id,
    playerLevel: parsePlayerLevel(friend.player_level),
    isSelected: false,
  }));
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
    logError("Could not load your profile.", error);
    throw new Error("Could not load your profile.");
  }

  return data;
}

async function getFriendPreferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessions: DashboardSessionRow[],
): Promise<Map<string, FriendCandidate[]>> {
  const activeSessions = sessions.filter(
    (session) => session.status === "open" || session.status === "confirmed",
  );
  const candidateRows = await Promise.all(
    activeSessions.map(async (session) => {
      const { data, error } = await supabase.rpc("get_session_friend_preferences", {
        p_session_id: session.id,
      });
      if (error) {
        logError("Could not load saved session friend choices.", {
          code: error.code,
        });
        throw new Error("Could not load saved friend choices.");
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
      logError("Could not load the confirmed player roster.", roster.error);
      throw new Error("Could not load the confirmed player roster.");
    }
  }

  return rosters.flatMap((roster) => roster.data ?? []);
}

function mapSession(
  row: DashboardSessionRow,
  rosterRows: RosterRow[],
  friendCandidates: FriendCandidate[],
  playerGameSchedule: import("../types").PlayerGame[] = [],
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
    feeCents: row.fee_cents,
    allocationMode: getAllocationMode(row.allocation_mode),
    currentUserStatus: getSignupStatus(row.current_user_status),
    currentUserSlot: row.current_user_slot,
    friendCandidates,
    timeSlots,
    playerGameSchedule,
  };
}

function mapFriendCandidate(row: FriendCandidateRow): FriendCandidate {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    studentId: row.student_id,
    playerLevel: parsePlayerLevel(row.player_level),
    isSelected: row.is_selected,
    isSignedUp: (row as FriendCandidateRow & { is_signed_up?: boolean }).is_signed_up ?? false,
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

function getDayName(value: string): ClubSessionDay {
  if (CLUB_SESSION_DAYS.includes(value as ClubSessionDay)) {
    return value as ClubSessionDay;
  }

  throw new Error("The session schedule returned an unsupported weekday.");
}

function getAllocationMode(value: string): SessionAllocationMode {
  if (value === "lottery" || value === "fcfs") {
    return value;
  }

  throw new Error("The session schedule returned an unsupported allocation mode.");
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
