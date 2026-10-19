import "server-only";

import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { allocateCourtSchedule, getCourtCount } from "@/features/sessions";
import { getSessionDayName } from "@/lib/sessions/schedule";
import type { PlayerLevel } from "@/types/player";

export type AdminPlayer = {
  userId: string;
  displayName: string;
  status: string;
  slotNumber: number | null;
};

export type AdminCourtGame = {
  courtNumber: number;
  startAt: string;
  endAt: string;
  players: string[];
};

export type AdminSession = {
  id: string;
  date: string;
  dayName: string;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  courtCount: number;
  status: string;
  availabilityCanChange: boolean;
  players: AdminPlayer[];
  courtSchedule: AdminCourtGame[];
};

export type AdminClubPlayer = {
  userId: string;
  displayName: string;
  playerLevel: PlayerLevel;
  isCommittee: boolean;
  canChooseProfessional: boolean;
};

export async function requireAdminUser() {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    throw new Error(`Could not verify club administrator: ${error.message}`);
  }
  if (!data.user) {
    return null;
  }

  const email = data.user?.email ?? "";

  if (!email || !/^[^@\s]+@atu\.ie$/i.test(email)) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_committee_admin")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) {
    throw new Error(`Could not verify club administrator access: ${profileError.message}`);
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
    throw new Error(`Could not load club players: ${error.message}`);
  }

  return data.map((player) => ({
    userId: player.user_id,
    displayName: player.display_name,
    playerLevel: parsePlayerLevel(player.player_level),
    isCommittee: player.is_committee,
    canChooseProfessional: player.can_choose_professional,
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

export async function loadAdminData(): Promise<AdminSession[]> {
  await connection();
  const admin = createAdminClient();
  const londonNow = getLondonDateTime(new Date());

  // Fetch all sessions that can be managed, including sessions marked as cancelled.
  // Only include sessions from today onwards (London date) — past sessions are
  // no longer actionable and should not appear on the admin schedule view.
  const { data: sessions, error: sessionsErr } = await admin
    .from("sessions")
    .select("id, event_date, starts_at, duration_minutes, capacity, status")
    .in("status", ["open", "confirmed", "cancelled"])
    .gte("event_date", londonNow.date)
    .order("event_date");

  if (sessionsErr) throw new Error(`Could not load sessions: ${sessionsErr.message}`);
  if (!sessions?.length) return [];

  const sessionIds = sessions.map((s) => s.id);

  const { data: signups, error: signupsErr } = await admin
    .from("session_signups")
    .select("session_id, user_id, status, slot_number")
    .in("session_id", sessionIds)
    .in("status", ["requested", "selected", "waitlisted", "played"]);

  if (signupsErr) throw new Error(`Could not load signups: ${signupsErr.message}`);

  const userIds = [...new Set((signups ?? []).map((s) => s.user_id))];

  const { data: friendPrefs } = await admin
    .from("session_friend_preferences")
    .select("session_id, user_id, friend_user_id")
    .in("session_id", sessionIds);

  const profileMap = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles, error: profilesErr } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    if (profilesErr) throw new Error(`Could not load profiles: ${profilesErr.message}`);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, p.display_name);
    }
  }

  return sessions.map((session) => {
    const sessionSignups = (signups ?? []).filter(
      (s) => s.session_id === session.id,
    );

    const sessionFriendMap = new Map<string, string[]>();
    for (const pref of friendPrefs ?? []) {
      if (pref.session_id === session.id) {
        const list = sessionFriendMap.get(pref.user_id) ?? [];
        list.push(pref.friend_user_id);
        sessionFriendMap.set(pref.user_id, list);
      }
    }

    const players: AdminPlayer[] = sessionSignups.map((s) => ({
      userId: s.user_id,
      displayName: profileMap.get(s.user_id) ?? s.user_id.slice(0, 8),
      status: s.status,
      slotNumber: s.slot_number,
    }));

    const courtCount = getCourtCount(session.capacity);
    const selectedPlayers = players
      .filter((p) => p.status === "selected" || p.status === "played")
      .sort((a, b) => (a.slotNumber ?? 99) - (b.slotNumber ?? 99));

    const courtSchedule = selectedPlayers.length
      ? allocateCourtSchedule(
          {
            id: session.id,
            startsAt: session.starts_at,
            durationMinutes: session.duration_minutes,
            courtCount,
          },
          selectedPlayers.map((player) => ({
            id: player.userId,
            displayName: player.displayName,
            priority: player.slotNumber ?? 1,
            friendIds: sessionFriendMap.get(player.userId) ?? [],
          })),
        ).map((game) => ({
          ...game,
          players: game.players.map(({ displayName }) => displayName),
        }))
      : [];

    return {
      id: session.id,
      date: session.event_date,
      dayName: getSessionDayName(session.event_date),
      startsAt: session.starts_at,
      durationMinutes: session.duration_minutes,
      capacity: session.capacity,
      courtCount,
      status: session.status,
      availabilityCanChange:
        session.event_date > londonNow.date ||
        (session.event_date === londonNow.date &&
          session.starts_at.slice(0, 5) > londonNow.time),
      players,
      courtSchedule,
    };
  });
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
