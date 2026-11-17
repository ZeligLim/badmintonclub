import "server-only";

import { connection } from "next/server";
import { readPersistedTimetables } from "@/features/sessions/api/timetable";
import { buildSessionTimetable } from "@/features/sessions/timetable-plan";
import { formatTimeOfDay } from "@/lib/format";
import { toSessionStatus, toSignupStatus } from "@/features/sessions/status";
import type {
  SessionSignupStatus,
} from "@/features/sessions/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SessionAllocationMode } from "@/features/sessions";
import { getSessionDayName } from "@/lib/sessions/schedule";
import { getClubNow } from "@/features/sessions/club-clock";
import { isSessionTimetableLocked } from "@/features/sessions/court-schedule";
import type { PlayerLevel } from "@/types/player";
import { isClubEmail } from "@/lib/validation";
import { logError } from "@/lib/log";

export type PaymentStatus = "unpaid" | "paid" | "waived";

export function toPaymentStatus(value: string): PaymentStatus {
  if (value === "paid" || value === "waived" || value === "unpaid") {
    return value;
  }
  return "unpaid";
}

export type AdminPlayer = {
  userId: string;
  displayName: string;
  status: SessionSignupStatus;
  slotNumber: number | null;
  isCommittee?: boolean;
  playerLevel?: PlayerLevel;
  paymentStatus: PaymentStatus;
};

export type AdminCourtPlayer = {
  id: string;
  displayName: string;
};

export type AdminCourtGame = {
  courtNumber: number;
  startAt: string;
  endAt: string;
  players: AdminCourtPlayer[];
};

export type AdminSession = {
  id: string;
  date: string;
  dayName: string;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  feeCents: number;
  courtCount: number;
  status: string;
  availabilityCanChange: boolean;
  players: AdminPlayer[];
  courtSchedule: AdminCourtGame[];
  /** True when the shown schedule exists only in memory and nothing is saved. */
  timetableNeedsSaving: boolean;
  /** True once the timetable has been released, so only administrators may edit it. */
  timetableLocked: boolean;
};

export type AdminClubPlayer = {
  userId: string;
  displayName: string;
  playerLevel: PlayerLevel;
  isCommittee: boolean;
  isCommitteeAdmin: boolean;
  canChooseProfessional: boolean;
};

export type AdminAuditEntry = {
  id: number;
  actorName: string;
  targetName: string;
  action: string;
  createdAt: string;
};

export type AdminSessionTemplate = {
  id: string;
  name: string;
  /** ISO weekday, 1 = Monday ... 7 = Sunday. */
  weekday: number;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  feeCents: number;
  allocationMode: SessionAllocationMode;
  committeeAutoSignup: boolean;
  signupOpensLeadDays: number;
  signupOpensAt: string;
  confirmationLeadDays: number;
  confirmationAt: string;
  isActive: boolean;
  validFrom: string | null;
  validUntil: string | null;
};

export async function requireAdminUser() {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error?.message?.includes("does not exist")) {
    await supabase.auth.signOut();
  } else if (error && error.name !== "AuthSessionMissingError") {
    logError("Could not verify club administrator.", error);
    throw new Error("Could not verify club administrator.");
  }
  if (!data.user) {
    return null;
  }

  const email = data.user?.email ?? "";

  if (!isClubEmail(email)) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_committee_admin")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) {
    logError("Could not verify club administrator access.", profileError);
    throw new Error("Could not verify club administrator access.");
  }
  if (!profile?.is_committee_admin) {
    return null;
  }

  return { email };
}

export async function loadClubPlayers(): Promise<AdminClubPlayer[]> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can manage player access.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_club_players");
  if (error) {
    logError("Could not load club players.", error);
    throw new Error("Could not load club players.");
  }

  return data.map((player) => ({
    userId: player.user_id,
    displayName: player.display_name,
    playerLevel: parsePlayerLevel(player.player_level),
    isCommittee: player.is_committee,
    isCommitteeAdmin: player.is_committee_admin,
    canChooseProfessional: player.can_choose_professional,
  }));
}

export async function loadAdminAuditLog(): Promise<AdminAuditEntry[]> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can read the audit log.");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id, actor_id, target_user_id, action, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    logError("Could not load the admin audit log.", error);
    throw new Error("Could not load the admin audit log.");
  }

  const userIds = [
    ...new Set(
      (data ?? []).flatMap((row) => [row.actor_id, row.target_user_id]),
    ),
  ].filter((id): id is string => typeof id === "string");

  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    if (profilesError) {
      logError("Could not load the names for the admin audit log.", profilesError);
    }
    for (const profile of profiles ?? []) {
      names.set(profile.id, profile.display_name);
    }
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    actorName: (row.actor_id && names.get(row.actor_id)) || "Former administrator",
    targetName:
      (row.target_user_id && names.get(row.target_user_id)) || "Former member",
    action: row.action,
    createdAt: row.created_at,
  }));
}

export async function loadSessionTemplates(): Promise<AdminSessionTemplate[]> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can manage session templates.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_session_templates");
  if (error) {
    logError("Could not load session templates.", error);
    throw new Error("Could not load session templates.");
  }

  return data.map((template) => ({
    id: template.id,
    name: template.name,
    weekday: template.weekday,
    startsAt: formatTimeOfDay(template.starts_at),
    durationMinutes: template.duration_minutes,
    capacity: template.capacity,
    feeCents: template.fee_cents,
    allocationMode: parseAllocationMode(template.allocation_mode),
    committeeAutoSignup: template.committee_auto_signup,
    signupOpensLeadDays: template.signup_opens_lead_days,
    signupOpensAt: formatTimeOfDay(template.signup_opens_at),
    confirmationLeadDays: template.confirmation_lead_days,
    confirmationAt: formatTimeOfDay(template.confirmation_at),
    isActive: template.is_active,
    validFrom: template.valid_from,
    validUntil: template.valid_until,
  }));
}

export async function loadAdminAccountCount(): Promise<number> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can view the account count.");
  }

  const admin = createAdminClient();
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (error || count === null) {
    throw new Error(`Could not load account count: ${error?.message ?? "Unknown error"}`);
  }

  return count;
}

export async function loadAdminData(options?: { allocationSeed?: string }): Promise<AdminSession[]> {
  await connection();
  const admin = createAdminClient();
  const clubNow = await getClubNow(admin);
  const londonNow = getLondonDateTime(clubNow);

  // Fetch all sessions that can be managed, including sessions marked as cancelled.
  // Only include sessions from today onwards (London date) — past sessions are
  // no longer actionable and should not appear on the admin schedule view.
  const { data: sessions, error: sessionsErr } = await admin
    .from("sessions")
    .select("id, event_date, starts_at, duration_minutes, capacity, court_count, fee_cents, status")
    .in("status", ["open", "confirmed", "cancelled"])
    .gte("event_date", londonNow.date)
    .order("event_date");

  if (sessionsErr) throw new Error(`Could not load sessions: ${sessionsErr.message}`);
  if (!sessions?.length) return [];

  const sessionIds = sessions.map((s) => s.id);

  const { data: signups, error: signupsErr } = await admin
    .from("session_signups")
    .select("session_id, user_id, status, slot_number, payment_status")
    .in("session_id", sessionIds)
    .in("status", ["requested", "selected", "waitlisted", "played"]);

  if (signupsErr) throw new Error(`Could not load signups: ${signupsErr.message}`);

  const userIds = [...new Set((signups ?? []).map((s) => s.user_id))];

  const { data: sessionFriendPrefs } = await admin
    .from("session_friend_preferences")
    .select("session_id, user_id, friend_user_id")
    .in("session_id", sessionIds);

  const { data: clubFriendPrefs } = userIds.length
    ? await admin
        .from("club_friend_list")
        .select("user_id, friend_user_id")
        .in("user_id", userIds)
    : { data: [] };

  const profileMap = new Map<
    string,
    { displayName: string; isCommittee: boolean; playerLevel: PlayerLevel }
  >();
  if (userIds.length) {
    const { data: profiles, error: profilesErr } = await admin
      .from("profiles")
      .select("id, display_name, is_committee, player_level")
      .in("id", userIds);

    if (profilesErr) throw new Error(`Could not load profiles: ${profilesErr.message}`);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, {
        displayName: p.display_name,
        isCommittee: p.is_committee,
        playerLevel: parsePlayerLevel(p.player_level),
      });
    }
  }

  const timetableMap = await readPersistedTimetables(sessionIds);

  return await Promise.all(sessions.map(async (session) => {
    const sessionSignups = (signups ?? []).filter(
      (s) => s.session_id === session.id,
    );

    const sessionFriendMap = new Map<string, string[]>();
    for (const pref of sessionFriendPrefs ?? []) {
      if (pref.session_id === session.id) {
        const list = sessionFriendMap.get(pref.user_id) ?? [];
        list.push(pref.friend_user_id);
        sessionFriendMap.set(pref.user_id, list);
      }
    }
    for (const pref of clubFriendPrefs ?? []) {
      const list = sessionFriendMap.get(pref.user_id) ?? [];
      if (!list.includes(pref.friend_user_id)) {
        list.push(pref.friend_user_id);
        sessionFriendMap.set(pref.user_id, list);
      }
    }

    const players: AdminPlayer[] = sessionSignups.map((s) => ({
      userId: s.user_id,
      displayName: profileMap.get(s.user_id)?.displayName ?? s.user_id.slice(0, 8),
      status: toSignupStatus(s.status),
      slotNumber: s.slot_number,
      isCommittee: profileMap.get(s.user_id)?.isCommittee ?? false,
      playerLevel: profileMap.get(s.user_id)?.playerLevel ?? "INTERMEDIATE",
      paymentStatus: toPaymentStatus(s.payment_status),
    }));

    const courtCount = session.court_count;
    const selectedPlayers = players
      .filter((p) => p.status === "selected" || p.status === "played")
      .sort((a, b) => (a.slotNumber ?? 99) - (b.slotNumber ?? 99));

    // Reading the admin page must never write. If a timetable is missing or
    // stale, this plans one for display and flags it so a committee member can
    // save it deliberately.
    const timetablePlan = buildSessionTimetable({
      session: {
        id: session.id,
        date: session.event_date,
        startsAt: session.starts_at,
        durationMinutes: session.duration_minutes,
        capacity: session.capacity,
        courtCount,
        isConfirmed: session.status === "confirmed",
      },
      now: clubNow,
      players: selectedPlayers.map((player) => ({
        id: player.userId,
        displayName: player.displayName,
        priority: player.slotNumber ?? 1,
        friendIds: sessionFriendMap.get(player.userId) ?? [],
        isCommittee: player.isCommittee,
        level: player.playerLevel,
      })),
      persisted: timetableMap.get(session.id),
      seed: options?.allocationSeed,
    });
    const courtScheduleGames = timetablePlan.games;

    const courtSchedule = courtScheduleGames.map((game) => ({
      ...game,
      players: game.players.map((player) =>
        typeof player === "string"
          ? {
              id: player,
              displayName: profileMap.get(player)?.displayName ?? "Unknown player",
            }
          : {
              id: player.id,
              displayName: player.displayName,
            },
      ),
    }));


    return {
      id: session.id,
      date: session.event_date,
      dayName: getSessionDayName(session.event_date),
      startsAt: session.starts_at,
      durationMinutes: session.duration_minutes,
      capacity: session.capacity,
      feeCents: session.fee_cents,
      courtCount,
      status: toSessionStatus(session.status),
      availabilityCanChange:
        session.event_date > londonNow.date ||
        (session.event_date === londonNow.date &&
          session.starts_at.slice(0, 5) > londonNow.time),
      players,
      courtSchedule,
      timetableNeedsSaving: timetablePlan.needsPersisting,
      timetableLocked: isSessionTimetableLocked(
        {
          eventDate: session.event_date,
          startsAt: session.starts_at,
        },
        clubNow,
      ),
    };
  }));
}

function getLondonDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

function parsePlayerLevel(playerLevel: string): PlayerLevel {
  if (
    playerLevel === "BEGINNER" ||
    playerLevel === "INTERMEDIATE" ||
    playerLevel === "PROFESSIONAL"
  ) {
    return playerLevel;
  }

  throw new Error("A club member has an unsupported player level.");
}

function parseAllocationMode(allocationMode: string): SessionAllocationMode {
  if (allocationMode === "lottery" || allocationMode === "fcfs") {
    return allocationMode;
  }

  throw new Error("A session template has an unsupported allocation mode.");
}

