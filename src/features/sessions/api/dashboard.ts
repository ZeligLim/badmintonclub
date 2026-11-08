import "server-only";

import {
  addMinutesToTime,
  CLUB_SESSION_DAYS,
  type ClubSessionDay,
} from "@/lib/sessions/schedule";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type {
  ClubSession,
  DashboardData,
  FriendCandidate,
  SessionAllocationMode,
  SessionSignupStatus,
  SessionStatus,
} from "../types";
import {
  getCourtCount,
  getPlayerGamesFromCourtSchedule,
  isCurrentPersistedCourtSchedule,
  isSessionTimetableLocked,
} from "../court-schedule";
import {
  ensureSessionTimetable,
  readPersistedTimetables,
} from "@/features/sessions/api/timetable";
import { isClubEmail } from "@/lib/validation";
import { logError, logWarning } from "@/lib/log";

type DashboardSessionRow =
  Database["public"]["Functions"]["get_dashboard_sessions"]["Returns"][number];
type ScheduleInputRow =
  Database["public"]["Functions"]["get_schedule_inputs"]["Returns"][number];
type RosterRow = Pick<
  ScheduleInputRow,
  "session_id" | "user_id" | "display_name" | "slot_number"
>;
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

  const scheduleInputs = user
    ? await getScheduleInputs(
        supabase,
        sessionRows.map((row) => row.id),
      )
    : [];
  const rosterRows: RosterRow[] = scheduleInputs.map((row) => ({
    session_id: row.session_id,
    user_id: row.user_id,
    display_name: row.display_name,
    slot_number: row.slot_number,
  }));
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
  const outdatedTimetimeables = new Set<string>();
  if (user) {
    try {
      const confirmedSessionIds = sessionRows
        .filter((row) => row.status === "confirmed")
        .map((row) => row.id);
      const playersBySession = new Map<string, ScheduleInputRow[]>();
      for (const row of scheduleInputs) {
        const list = playersBySession.get(row.session_id) ?? [];
        list.push(row);
        playersBySession.set(row.session_id, list);
      }

      // Every viewer reads the same saved timetable. Recomputing a personal
      // timetable here was the source of members seeing different courts.
      const timetableBySession = await readPersistedTimetables(
        confirmedSessionIds,
      );

      for (const sessionRow of sessionRows.filter(
        (row) => row.status === "confirmed",
      )) {
        const timetable = await ensureSessionTimetable({
          session: {
            id: sessionRow.id,
            date: sessionRow.event_date,
            startsAt: sessionRow.starts_at,
            durationMinutes: sessionRow.duration_minutes,
            capacity: sessionRow.capacity,
            isConfirmed: true,
          },
          players: (playersBySession.get(sessionRow.id) ?? []).map((player) => ({
            id: player.user_id,
            displayName: player.display_name,
            priority: player.slot_number ?? 1,
            friendIds: player.friend_ids ?? [],
            isCommittee: player.is_committee,
            level: parsePlayerLevel(player.player_level),
          })),
          persisted: timetableBySession.get(sessionRow.id),
        });

        userPlayerGameSchedules.set(
          sessionRow.id,
          getPlayerGamesFromCourtSchedule(timetable, user.id),
        );

        const persisted = timetableBySession.get(sessionRow.id);
        if (
          persisted &&
          isSessionTimetableLocked({
            eventDate: sessionRow.event_date,
            startsAt: sessionRow.starts_at,
          }) &&
          !isCurrentPersistedCourtSchedule(persisted)
        ) {
          // A released timetable built by an older allocator cannot be refreshed
          // automatically; flag it so the committee can repair it by hand.
          outdatedTimetimeables.add(sessionRow.id);
        }
      }
    } catch (error) {
      logError("Could not build personalized game schedule.", error);
    }
  }

  const sessions: ClubSession[] = [];
  for (const row of sessionRows) {
    try {
      sessions.push(
        mapSession(
          row,
          rosterRows,
          friendCandidates.get(row.id) ?? [],
          userPlayerGameSchedules.get(row.id) ?? [],
          outdatedTimetimeables.has(row.id),
        ),
      );
    } catch (error) {
      // One malformed row must not take the whole club night off the screen.
      logError("Skipped a session with unexpected data.", error, {
        sessionId: row.id,
      });
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
    sessions,
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
  const activeSessionIds = sessions
    .filter(
      (session) => session.status === "open" || session.status === "confirmed",
    )
    .map((session) => session.id);
  if (activeSessionIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.rpc(
    "get_session_friend_preferences_bulk",
    { p_session_ids: activeSessionIds },
  );
  if (error) {
    logError("Could not load saved session friend choices.", {
      code: error.code,
    });
    throw new Error("Could not load saved friend choices.");
  }

  const bySession = new Map<string, FriendCandidateRow[]>();
  for (const row of data ?? []) {
    const list = bySession.get(row.session_id) ?? [];
    list.push(row);
    bySession.set(row.session_id, list);
  }

  return new Map(
    activeSessionIds.map((sessionId) => [
      sessionId,
      (bySession.get(sessionId) ?? []).map(mapFriendCandidate),
    ]),
  );
}

async function getScheduleInputs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionIds: string[],
): Promise<ScheduleInputRow[]> {
  if (sessionIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase.rpc("get_schedule_inputs", {
    p_session_ids: sessionIds,
  });
  if (error) {
    logError("Could not load the session schedule inputs.", error);
    throw new Error("Could not load the session schedule inputs.");
  }

  return data ?? [];
}

function mapSession(
  row: DashboardSessionRow,
  rosterRows: RosterRow[],
  friendCandidates: FriendCandidate[],
  playerGameSchedule: import("../types").PlayerGame[] = [],
  timetableOutdated = false,
): ClubSession {
  const dayName = getDayName(row.day_name, row.event_date);
  const status = getSessionStatus(row.status);
  const needsAttention =
    !CLUB_SESSION_DAYS.includes(row.day_name as ClubSessionDay) ||
    !["open", "confirmed", "closed", "cancelled"].includes(row.status) ||
    !["lottery", "fcfs"].includes(row.allocation_mode);
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
    needsAttention,
    timetableOutdated,
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

function parsePlayerLevel(
  playerLevel: string,
  context?: { userId?: string },
): FriendCandidate["playerLevel"] {
  if (
    playerLevel === "BEGINNER" ||
    playerLevel === "INTERMEDIATE" ||
    playerLevel === "PROFESSIONAL"
  ) {
    return playerLevel;
  }

  // A value written by a newer build (or a hand-edited row) must not take the
  // whole dashboard down; treat it as the club default and say so in the log.
  logWarning("A club member has an unsupported player level.", {
    playerLevel,
    ...context,
  });
  return "INTERMEDIATE";
}

function getDayName(value: string, eventDate: string): ClubSessionDay {
  if (CLUB_SESSION_DAYS.includes(value as ClubSessionDay)) {
    return value as ClubSessionDay;
  }

  // Fall back to the date the row already carries rather than dropping the
  // session from the page.
  const derived = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "Europe/London",
  }).format(new Date(`${eventDate}T12:00:00Z`));
  logWarning("The session schedule returned an unsupported weekday.", {
    value,
    eventDate,
  });
  return CLUB_SESSION_DAYS.includes(derived as ClubSessionDay)
    ? (derived as ClubSessionDay)
    : "Monday";
}

function getAllocationMode(value: string): SessionAllocationMode {
  if (value === "lottery" || value === "fcfs") {
    return value;
  }

  logWarning("The session schedule returned an unsupported allocation mode.", {
    value,
  });
  return "lottery";
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

  // Closed is the safe default: it renders and blocks sign-ups.
  logWarning("The session schedule returned an unsupported status.", { value });
  return "closed";
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

  logWarning("A session signup returned an unsupported status.", { value });
  return null;
}
