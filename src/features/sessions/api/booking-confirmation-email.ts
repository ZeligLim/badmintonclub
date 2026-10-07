import "server-only";

import {
  sendMailjetEmails,
  type MailjetConfig,
  type MailjetEmail,
} from "../../../../supabase/functions/_shared/mailjet";
import { createPlayerGameSchedule } from "../court-schedule";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const BOOKING_CONFIRMATION_TEMPLATE_ID = 8414880;
const BOOKING_CONFIRMATION_SUBJECT = "You're in! 🎉";
const BOOKING_CONFIRMATION_SENDER_EMAIL = "badmintonclubwebapp@gmail.com";
const BOOKING_CONFIRMATION_SENDER_NAME = "ATU Badminton Club";

export async function sendBookingConfirmationEmailBestEffort(
  supabase: SupabaseServerClient,
  sessionId: string,
): Promise<void> {
  let failureStage = "booking-details";

  try {
    const email = await createBookingConfirmationEmail(supabase, sessionId);
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

async function createBookingConfirmationEmail(
  supabase: SupabaseServerClient,
  sessionId: string,
): Promise<MailjetEmail> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user?.email) {
    throw new Error("Could not load the booking recipient.");
  }

  const [{ data: session, error: sessionError }, { data: signup, error: signupError }] =
    await Promise.all([
      supabase
        .from("sessions")
        .select("event_date, starts_at, duration_minutes, capacity, status")
        .eq("id", sessionId)
        .maybeSingle(),
      supabase
        .from("session_signups")
        .select("status, slot_number")
        .eq("session_id", sessionId)
        .eq("user_id", authData.user.id)
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
  if (rosterError) {
    throw new Error("Could not load the confirmed session roster.");
  }

  const sessionDetails = {
    startsAt: session.starts_at,
    durationMinutes: session.duration_minutes,
    courtCount: session.capacity / 8,
  };
  const groupCount = Math.ceil(roster.length / 4);
  const playerGames = createPlayerGameSchedule(
    sessionDetails,
    signup.slot_number,
    groupCount,
  );
  const assignedCourts = [
    ...new Set(playerGames.map((game) => game.courtNumber)),
  ];

  if (assignedCourts.length === 0) {
    throw new Error("Could not determine the confirmed court assignment.");
  }

  return {
    to: authData.user.email,
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
