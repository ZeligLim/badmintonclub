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
    .select("id, status, event_date, starts_at, duration_minutes, capacity, court_count")
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
      courtCount: session.court_count,
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

export async function updateSessionCourtCount(sessionId: string, courtCount: number): Promise<void> {
  if (!(await requireAdminUser())) throw new Error("Only a club administrator can change court count.");
  if (!isUuid(sessionId) || !Number.isInteger(courtCount) || courtCount < 1 || courtCount > 4) {
    throw new Error("Choose between one and four courts.");
  }
  const admin = createAdminClient();
  const { data: session, error: readError } = await admin.from("sessions")
    .select("id, status, event_date, starts_at, court_count").eq("id", sessionId).maybeSingle();
  if (readError || !session || !["open", "confirmed"].includes(session.status)) throw new Error("This session cannot be changed.");
  if (isSessionTimetableLocked({ eventDate: session.event_date, startsAt: session.starts_at })) {
    throw new Error("The timetable has already been released and can no longer be changed.");
  }
  const { error } = await admin.from("sessions").update({ court_count: courtCount }).eq("id", sessionId);
  if (error) throw new Error("Could not update the court count.");
  const { count: selectedCount, error: selectedError } = await admin.from("session_signups")
    .select("user_id", { count: "exact", head: true }).eq("session_id", sessionId).in("status", ["selected", "played"]);
  if (selectedError) {
    await admin.from("sessions").update({ court_count: session.court_count }).eq("id", sessionId);
    throw new Error("Could not check the current timetable.");
  }
  if ((selectedCount ?? 0) > 0) {
    try { await regenerateSessionCourtSchedule(sessionId); }
    catch (scheduleError) {
      await admin.from("sessions").update({ court_count: session.court_count }).eq("id", sessionId);
      throw scheduleError;
    }
  }
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function updateSessionCapacity(sessionId: string, capacity: number): Promise<void> {
  if (!(await requireAdminUser())) throw new Error("Only a club administrator can change session capacity.");
  if (!isUuid(sessionId) || !Number.isInteger(capacity) || capacity < 4 || capacity > 64 || capacity % 4 !== 0) {
    throw new Error("Choose a capacity from 4 to 64 in steps of four.");
  }

  const admin = createAdminClient();
  const { data: session, error: readError } = await admin
    .from("sessions")
    .select("id, status, event_date, starts_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (readError || !session || !["open", "confirmed"].includes(session.status)) {
    throw new Error("This session capacity cannot be changed.");
  }
  if (isSessionTimetableLocked({ eventDate: session.event_date, startsAt: session.starts_at })) {
    throw new Error("The timetable has already been released and can no longer be changed.");
  }

  const { count: activeSignupCount, error: signupError } = await admin
    .from("session_signups")
    .select("user_id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .in("status", ["requested", "selected", "played"]);
  if (signupError) {
    logError("Could not check the current session signups.", signupError);
    throw new Error("Could not check the current session signups.");
  }
  if ((activeSignupCount ?? 0) > capacity) {
    throw new Error(`Capacity cannot be lower than the ${activeSignupCount} active signups.`);
  }

  const { error: updateError } = await admin
    .from("sessions")
    .update({ capacity })
    .eq("id", sessionId);
  if (updateError) {
    logError("Could not update session capacity.", updateError);
    throw new Error("Could not update session capacity.");
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

export async function swapSessionPlayer(
  sessionId: string,
  outUserId: string,
  inUserId: string,
  reason: string,
): Promise<void> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can repair a timetable.");
  }
  if (!isUuid(sessionId) || !isUuid(outUserId) || !isUuid(inUserId)) {
    throw new Error("The timetable repair request is invalid.");
  }
  if (typeof reason !== "string" || reason.length > 280) {
    throw new Error("Keep the reason under 280 characters.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_swap_session_player", {
    p_session_id: sessionId,
    p_out_user_id: outUserId,
    p_in_user_id: inUserId,
    p_reason: reason.trim(),
  });
  if (error) {
    logError("Could not repair the timetable.", error);
    throw new Error(
      [
        "That player is not currently in the timetable.",
        "That member is not waiting for a place.",
        "That player is not in the saved timetable.",
        "Only a club administrator can repair a timetable.",
        "Choose two different players.",
      ].includes(error.message)
        ? error.message
        : "Could not repair the timetable.",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function promoteFromWaitlist(
  sessionId: string,
  userId: string,
): Promise<void> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can promote a member.");
  }
  if (!isUuid(sessionId) || !isUuid(userId)) {
    throw new Error("The promotion request is invalid.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_promote_from_waitlist", {
    p_session_id: sessionId,
    p_user_id: userId,
  });
  if (error) {
    logError("Could not promote a member from the waitlist.", error);
    throw new Error(
      error.message === "Every place is already taken."
        ? "Every place is already taken."
        : "Could not promote a member from the waitlist.",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function updatePaymentStatus(
  sessionId: string,
  userId: string,
  paymentStatus: "unpaid" | "paid" | "waived",
): Promise<void> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can record a payment.");
  }
  if (!isUuid(sessionId) || !isUuid(userId)) {
    throw new Error("The payment request is invalid.");
  }
  if (!["unpaid", "paid", "waived"].includes(paymentStatus)) {
    throw new Error("Choose unpaid, paid or waived.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_payment_status", {
    p_session_id: sessionId,
    p_user_id: userId,
    p_payment_status: paymentStatus,
  });
  if (error) {
    logError("Could not record a payment.", error);
    throw new Error(
      error.message === "That member is not signed up for this session."
        ? error.message
        : "Could not record a payment.",
    );
  }

  revalidatePath("/admin");
}

type TimetableEditArgs = {
  sessionId: string;
  reason?: string;
};

function assertTimetableEdit(admin: boolean, sessionId: string): void {
  if (!admin) {
    throw new Error("Only a club administrator can repair a timetable.");
  }
  if (typeof sessionId !== "string" || !isUuid(sessionId)) {
    throw new Error("The timetable request is invalid.");
  }
}

function reasonOrNull(reason: string | undefined): string | undefined {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : undefined;
}

function isCourtNumber(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

function isStartAt(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function swapTimetablePlayers(
  input: TimetableEditArgs & {
    playerAId: string;
    courtA: number;
    startA: string;
    playerBId: string;
    courtB: number;
    startB: string;
  },
): Promise<void> {
  assertTimetableEdit((await requireAdminUser()) !== null, input.sessionId);
  if (
    !isUuid(input.playerAId) ||
    !isUuid(input.playerBId) ||
    !isCourtNumber(input.courtA) ||
    !isCourtNumber(input.courtB) ||
    !isStartAt(input.startA) ||
    !isStartAt(input.startB)
  ) {
    throw new Error("The timetable request is invalid.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_swap_session_players", {
    p_session_id: input.sessionId,
    p_user_a_id: input.playerAId,
    p_court_a: input.courtA,
    p_start_a: input.startA,
    p_user_b_id: input.playerBId,
    p_court_b: input.courtB,
    p_start_b: input.startB,
    p_reason: reasonOrNull(input.reason),
  });
  if (error) {
    logError("Could not swap those players.", error);
    throw new Error(error.message || "Could not swap those players.");
  }

  revalidatePath("/admin");
}

export async function removeTimetablePlayer(
  input: TimetableEditArgs & { playerId: string },
): Promise<void> {
  assertTimetableEdit((await requireAdminUser()) !== null, input.sessionId);
  if (!isUuid(input.playerId)) {
    throw new Error("The timetable request is invalid.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_session_player", {
    p_session_id: input.sessionId,
    p_user_id: input.playerId,
    p_reason: reasonOrNull(input.reason),
  });
  if (error) {
    logError("Could not take that player out.", error);
    throw new Error(error.message || "Could not take that player out.");
  }

  revalidatePath("/admin");
}

export async function placeTimetablePlayer(
  input: TimetableEditArgs & {
    playerId: string;
    courtNumber: number;
    startAt: string;
    /** The seat the player is leaving, when they are already in the timetable. */
    fromCourtNumber?: number;
    fromStartAt?: string;
  },
): Promise<void> {
  assertTimetableEdit((await requireAdminUser()) !== null, input.sessionId);
  if (
    !isUuid(input.playerId) ||
    !isCourtNumber(input.courtNumber) ||
    !isStartAt(input.startAt) ||
    (input.fromCourtNumber !== undefined && !isCourtNumber(input.fromCourtNumber)) ||
    (input.fromStartAt !== undefined && !isStartAt(input.fromStartAt)) ||
    (input.fromCourtNumber === undefined) !== (input.fromStartAt === undefined)
  ) {
    throw new Error("The timetable request is invalid.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_place_session_player", {
    p_session_id: input.sessionId,
    p_user_id: input.playerId,
    p_court_number: input.courtNumber,
    p_start_at: input.startAt,
    p_reason: reasonOrNull(input.reason),
    p_from_court_number: input.fromCourtNumber,
    p_from_start_at: input.fromStartAt,
  });
  if (error) {
    logError("Could not place that player.", error);
    throw new Error(error.message || "Could not place that player.");
  }

  revalidatePath("/admin");
}
