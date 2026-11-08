"use server";

import { isUuid } from "@/lib/validation";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSessionTimetableLocked } from "@/features/sessions";
import { toPlayerLevel } from "@/features/sessions/court-schedule.levels";
import { ensureSessionTimetable } from "@/features/sessions/api/timetable";
import { requireAdminUser } from "./data";
import { logError } from "@/lib/log";

export async function regenerateSessionCourtSchedule(sessionId: string): Promise<void> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can regenerate a court schedule.");
  }
  if (
    typeof sessionId !== "string" ||
    !isUuid(sessionId)
  ) {
    throw new Error("The session schedule request is invalid.");
  }

  const admin = createAdminClient();
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("id, status, event_date, starts_at, duration_minutes, capacity")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError || !session || !["open", "confirmed"].includes(session.status)) {
    throw new Error("This session cannot have its court schedule regenerated.");
  }
  if (
    isSessionTimetableLocked({
      eventDate: session.event_date,
      startsAt: session.starts_at,
    })
  ) {
    throw new Error(
      "The timetable has already been released to players and can no longer be changed.",
    );
  }

  const { data: signups, error: signupError } = await admin
    .from("session_signups")
    .select("user_id, status, slot_number")
    .eq("session_id", sessionId)
    .in("status", ["selected", "played"]);
  if (signupError) {
    logError("Could not load the players for the court schedule.", signupError);
    throw new Error("Could not load the players for the court schedule.");
  }
  if (!signups || signups.length === 0) {
    throw new Error("There are no selected players to build a court schedule from.");
  }

  const playerIds = signups.map((signup) => signup.user_id);
  const [{ data: profiles, error: profileError }, { data: sessionPrefs, error: prefError }, { data: clubPrefs, error: clubError }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, display_name, player_level, is_committee")
        .in("id", playerIds),
      admin
        .from("session_friend_preferences")
        .select("user_id, friend_user_id")
        .eq("session_id", sessionId),
      admin.from("club_friend_list").select("user_id, friend_user_id").in("user_id", playerIds),
    ]);
  if (profileError || prefError || clubError) {
    logError("Could not load the court schedule inputs.", profileError ?? prefError ?? clubError);
    throw new Error("Could not load the court schedule inputs.");
  }

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const friendMap = new Map<string, string[]>();
  for (const pref of [...(sessionPrefs ?? []), ...(clubPrefs ?? [])]) {
    const list = friendMap.get(pref.user_id) ?? [];
    if (!list.includes(pref.friend_user_id)) {
      list.push(pref.friend_user_id);
      friendMap.set(pref.user_id, list);
    }
  }

  // Write the new schedule in place. Deleting the saved row first would leave
  // the session without a timetable if the rebuild failed.
  const timetable = await ensureSessionTimetable({
    session: {
      id: session.id,
      date: session.event_date,
      startsAt: session.starts_at,
      durationMinutes: session.duration_minutes,
      capacity: session.capacity,
      isConfirmed: session.status === "confirmed",
    },
    players: signups.map((signup) => {
      const profile = profileMap.get(signup.user_id);
      return {
        id: signup.user_id,
        displayName: profile?.display_name ?? signup.user_id.slice(0, 8),
        priority: signup.slot_number ?? 1,
        friendIds: friendMap.get(signup.user_id) ?? [],
        isCommittee: profile?.is_committee ?? false,
        level: toPlayerLevel(profile?.player_level),
      };
    }),
    seed: randomUUID(),
  });

  if (timetable.length === 0) {
    throw new Error("The court schedule could not be regenerated.");
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function updateSessionAvailability(
  sessionId: string,
  isHappening: boolean,
): Promise<void> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can change session availability.");
  }
  if (!isUuid(sessionId) || typeof isHappening !== "boolean") {
    throw new Error("The session availability request is invalid.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_session_happening", {
    p_session_id: sessionId,
    p_happening: isHappening,
  });
  if (error) {
    logError("Could not update session availability.", error);
    throw new Error("Could not update session availability.");
  }

  revalidatePath("/admin");
  revalidatePath("/");
}
