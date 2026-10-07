import { londonDateTime } from "@/lib/sessions/schedule";
import type { ClubSession } from "./types";

export type SessionPeriod = "upcoming" | "in-progress" | "over";

export function getSessionPeriod(
  session: ClubSession,
  currentTime: Date,
): SessionPeriod {
  const sessionStart = getSessionStartTimestamp(session);
  const sessionEnd = sessionStart + session.durationMinutes * 60_000;
  const currentTimestamp = currentTime.getTime();

  if (currentTimestamp >= sessionEnd) {
    return "over";
  }
  if (currentTimestamp >= sessionStart) {
    return "in-progress";
  }

  return "upcoming";
}

export function isSessionViewVisible(
  session: ClubSession,
  currentTime: Date,
) {
  const sessionStart = getSessionStartTimestamp(session);
  const sessionViewOpens = sessionStart - 30 * 60_000;
  const currentTimestamp = currentTime.getTime();

  return (
    currentTimestamp >= sessionViewOpens &&
    getSessionPeriod(session, currentTime) !== "over"
  );
}

export function isSessionInProgress(session: ClubSession, currentTime: Date) {
  return getSessionPeriod(session, currentTime) === "in-progress";
}

export function getSignupWindowStatus(
  session: ClubSession,
  currentTime: Date,
): "not-open" | "open" | "closed" {
  const currentTimestamp = currentTime.getTime();
  const signupOpensAt = new Date(session.signupOpensAt).getTime();
  const confirmationAt = new Date(session.confirmationAt).getTime();

  if (session.status !== "open" || currentTimestamp >= confirmationAt) {
    return "closed";
  }
  if (currentTimestamp < signupOpensAt) {
    return "not-open";
  }

  return "open";
}

export function getSessionStartTimestamp(session: ClubSession) {
  if (session.startsAt.includes("T")) {
    return new Date(session.startsAt).getTime();
  }

  const [hour, minute] = session.startsAt.split(":").map(Number);
  const sessionDate = new Date(`${session.date}T12:00:00Z`);
  return new Date(londonDateTime(sessionDate, hour, minute)).getTime();
}
