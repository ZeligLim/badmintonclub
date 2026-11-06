"use server";

import { isUuid } from "@/lib/validation";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isCurrentPersistedCourtSchedule,
  isSessionTimetableLocked,
} from "@/features/sessions";
import { loadAdminData, requireAdminUser } from "./data";
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
    .select("id, status, event_date, starts_at")
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

  const { error: deleteError } = await admin
    .from("session_timetables")
    .delete()
    .eq("session_id", sessionId);
  if (deleteError) {
    logError("Could not clear the saved court schedule.", deleteError);
    throw new Error("Could not clear the saved court schedule.");
  }

  const sessions = await loadAdminData({ allocationSeed: randomUUID() });
  const regeneratedSession = sessions.find((item) => item.id === sessionId);
  if (!regeneratedSession?.courtSchedule.length) {
    throw new Error("The court schedule could not be regenerated.");
  }

  const { data: timetable, error: timetableError } = await admin
    .from("session_timetables")
    .select("court_schedule")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (timetableError || !isCurrentPersistedCourtSchedule(timetable?.court_schedule)) {
    throw new Error("The regenerated court schedule could not be saved.");
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
