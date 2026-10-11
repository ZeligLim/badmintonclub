import "server-only";

import {
  sendMailjetEmails,
  type MailjetConfig,
  type MailjetEmail,
} from "@shared/mailjet";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPlayerGameSchedule, getCourtCount } from "../court-schedule";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type BookingEmailRecipient = {
  sessionId: string;
  userId: string;
  emailAddress: string;
};

const BOOKING_CONFIRMATION_TEMPLATE_ID = 8414880;
const BOOKING_CONFIRMATION_SUBJECT = "You're in! 🎉";
const BOOKING_CONFIRMATION_SENDER_EMAIL = "badmintonclubwebapp@gmail.com";
const BOOKING_CONFIRMATION_SENDER_NAME = "ATU Badminton Club";

export async function finalizeDueSessionsAndEmail(
  supabase: SupabaseServerClient,
): Promise<number> {
  const { data: dueSessions, error: dueSessionsError } = await supabase
    .from("sessions")
    .select("id")
    .eq("status", "open")
    .lte("confirmation_at", new Date().toISOString());

  if (dueSessionsError) {
    throw new Error(`Could not load sessions awaiting confirmation: ${dueSessionsError.message}`);
  }

  const { data: finalizedCount, error: finalizeError } = await supabase.rpc(
    "finalize_due_sessions",
  );
  if (finalizeError) {
    throw new Error(`Could not finalize due sessions: ${finalizeError.message}`);
  }

  await sendSelectedBookingConfirmationEmails(
    supabase,
    (dueSessions ?? []).map(({ id }) => id),
  );
  return finalizedCount;
}

export async function sendBookingConfirmationEmailBestEffort(
  supabase: SupabaseServerClient,
  sessionId: string,
): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user?.email) return;

  await sendBookingConfirmationEmailToRecipient(
    supabase,
    {
      sessionId,
      userId: authData.user.id,
      emailAddress: authData.user.email,
    },
  );
}

async function sendBookingConfirmationEmailToRecipient(
  supabase: SupabaseServerClient,
  recipient: BookingEmailRecipient,
): Promise<void> {
  let failureStage = "booking-details";
  try {
    const email = await createBookingConfirmationEmail(
      supabase,
      recipient,
    );
    failureStage = "mailjet-send";
    const config = getMailjetConfig();
    const [sent] = await sendMailjetEmails(config, [email]);
    if (!sent) {
      throw new Error("Mailjet did not accept the booking confirmation email.");
    }
  } catch (error) {
    console.error("Booking confirmation email failed.", {
      stage: failureStage,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

async function sendSelectedBookingConfirmationEmails(
  supabase: SupabaseServerClient,
  sessionIds: string[],
): Promise<void> {
  if (sessionIds.length === 0) return;

  const admin = createAdminClient();
  const { data: signups, error } = await admin
    .from("session_signups")
    .select("session_id, user_id")
    .eq("status", "selected")
    .in("session_id", sessionIds);

  if (error) {
    console.error("Could not load newly confirmed bookings for email.", {
      code: error.code,
    });
    return;
  }

  await Promise.all(
    (signups ?? []).map(async (signup) => {
      const { data, error: userError } = await admin.auth.admin.getUserById(
        signup.user_id,
      );
      if (userError || !data.user?.email) {
        console.error("Could not load a selected booking email recipient.", {
          userId: signup.user_id,
        });
        return;
      }

      await sendBookingConfirmationEmailToRecipient(
        supabase,
        {
          sessionId: signup.session_id,
          userId: signup.user_id,
          emailAddress: data.user.email,
        },
      );
    }),
  );
}

async function createBookingConfirmationEmail(
  supabase: SupabaseServerClient,
  recipient: BookingEmailRecipient,
): Promise<MailjetEmail> {
  const { sessionId, userId, emailAddress } = recipient;
  const admin = createAdminClient();
  const [{ data: session, error: sessionError }, { data: signup, error: signupError }] =
    await Promise.all([
      admin
        .from("sessions")
        .select("event_date, starts_at, duration_minutes, capacity, status")
        .eq("id", sessionId)
        .maybeSingle(),
      admin
        .from("session_signups")
        .select("status, slot_number")
        .eq("session_id", sessionId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  if (sessionError || !session || session.status !== "confirmed") {
    throw new Error("Could not load the confirmed session.");
  }
  if (
    signupError ||
    signup?.status !== "selected" ||
    signup.slot_number === null
  ) {
    throw new Error("Could not load the confirmed booking.");
  }

  const { data: roster, error: rosterError } = await supabase.rpc(
    "get_session_roster",
    { p_session_id: sessionId },
  );
  if (rosterError || !roster) {
    throw new Error("Could not load the confirmed session roster.");
  }

  const sessionDetails = {
    id: sessionId,
    startsAt: session.starts_at,
    durationMinutes: session.duration_minutes,
    courtCount: getCourtCount(session.capacity),
  };
  const playerGames = createPlayerGameSchedule(
    sessionDetails,
    roster.map((player) => ({
      id: player.user_id,
      displayName: player.display_name,
      priority: player.slot_number,
    })),
    userId,
  );
  const assignedCourts = [
    ...new Set(playerGames.map((game) => game.courtNumber)),
  ];

  if (assignedCourts.length === 0) {
    throw new Error("Could not determine the confirmed court assignment.");
  }

  return {
    to: emailAddress,
    subject: BOOKING_CONFIRMATION_SUBJECT,
    template: {
      id: BOOKING_CONFIRMATION_TEMPLATE_ID,
      language: true,
      variables: {
        session_name: `${getWeekday(session.event_date)} Badminton Session`,
        date: formatSessionDate(session.event_date),
        time: session.starts_at.slice(0, 5),
        court: formatCourtAssignment(assignedCourts),
      },
    },
  };
}

function getMailjetConfig(): MailjetConfig {
  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("Mailjet credentials are unavailable.");
  }

  return {
    apiKey,
    apiSecret,
    senderEmail: BOOKING_CONFIRMATION_SENDER_EMAIL,
    senderName: BOOKING_CONFIRMATION_SENDER_NAME,
  };
}

function getWeekday(date: string): string {
  return new Intl.DateTimeFormat("en-IE", {
    weekday: "long",
    timeZone: "Europe/Dublin",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatSessionDate(date: string): string {
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Dublin",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatCourtAssignment(courtNumbers: number[]): string {
  const courtNames = courtNumbers.map((courtNumber) => `Court ${courtNumber}`);
  return courtNames.length === 1
    ? courtNames[0]
    : courtNames.join(", ");
}
