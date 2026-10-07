import { londonDateTime } from "@/lib/sessions/schedule";
import type { ClubSession } from "./types";

export function hasSessionEnded(session: ClubSession) {
  const sessionEnd =
    getSessionStartTimestamp(session) + session.durationMinutes * 60_000;

  return sessionEnd <= Date.now();
}

export function isSessionViewVisible(
  session: ClubSession,
  currentTime: Date,
) {
  const sessionStart = getSessionStartTimestamp(session);
  const sessionEnd = sessionStart + session.durationMinutes * 60_000;
  const sessionViewOpens = sessionStart - 30 * 60_000;
  const currentTimestamp = currentTime.getTime();

  return currentTimestamp >= sessionViewOpens && currentTimestamp < sessionEnd;
}

export function isSessionInProgress(
  session: ClubSession,
  currentTime: Date,
) {
  const sessionStart = getSessionStartTimestamp(session);
  const sessionEnd = sessionStart + session.durationMinutes * 60_000;
  const currentTimestamp = currentTime.getTime();

  return currentTimestamp >= sessionStart && currentTimestamp < sessionEnd;
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
