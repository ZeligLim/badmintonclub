import { getSessionPeriod } from "./session-timing";
import type { ClubSession } from "./types";

export type DemoSessionState = {
  sessionId: string;
  dayName: ClubSession["dayName"];
  registeredCount: number;
  currentUserStatus: string | null;
  currentUserSlot: number | null;
};

export function createDemoSessionState(
  session: ClubSession,
  index: number,
): DemoSessionState {
  const shouldPreviewCourt =
    index === 0 &&
    session.currentUserStatus === null &&
    session.registeredCount < session.capacity;

  return {
    sessionId: session.id,
    dayName: session.dayName,
    registeredCount: session.registeredCount,
    currentUserStatus: shouldPreviewCourt
      ? "requested"
      : session.currentUserStatus,
    currentUserSlot: shouldPreviewCourt
      ? null
      : session.currentUserSlot,
  };
}

export function getDemoSessionStatus(
  session: ClubSession,
  currentTime: Date,
) {
  if (getSessionPeriod(session, currentTime) === "over") {
    return "closed" as const;
  }
  if (currentTime.getTime() >= new Date(session.confirmationAt).getTime()) {
    return "confirmed" as const;
  }

  return "open" as const;
}

export function getDemoSignupState(
  session: ClubSession,
  storedState: DemoSessionState | undefined,
  registeredCount: number,
) {
  const currentUserStatus =
    storedState?.currentUserStatus ?? session.currentUserStatus;
  const currentUserSlot = storedState?.currentUserSlot ?? session.currentUserSlot;

  if (session.status === "open") {
    return { registeredCount, currentUserStatus, currentUserSlot };
  }

  const confirmedCount = Math.min(registeredCount, session.capacity);
  const isSelected =
    currentUserStatus === "requested" && registeredCount <= session.capacity;

  return {
    registeredCount: confirmedCount,
    currentUserStatus:
      currentUserStatus === "requested"
        ? isSelected
          ? "selected"
          : "waitlisted"
        : currentUserStatus,
    currentUserSlot:
      currentUserStatus === "requested"
        ? isSelected
          ? 1
          : null
        : currentUserSlot,
  };
}

export function toggleDemoSignup(
  currentSession: DemoSessionState,
  session: ClubSession,
): DemoSessionState {
  const isWaitlisted =
    currentSession.currentUserStatus?.toLowerCase().includes("waitlist") ??
    false;
  const isRegistered =
    currentSession.currentUserStatus !== null && !isWaitlisted;

  if (isRegistered || isWaitlisted) {
    return {
      ...currentSession,
      registeredCount: isRegistered
        ? Math.max(currentSession.registeredCount - 1, 0)
        : currentSession.registeredCount,
      currentUserStatus: null,
      currentUserSlot: null,
    };
  }

  const hasCapacity = currentSession.registeredCount < session.capacity;

  return {
    ...currentSession,
    registeredCount: hasCapacity
      ? currentSession.registeredCount + 1
      : currentSession.registeredCount,
    currentUserStatus: hasCapacity ? "requested" : "waitlisted",
    currentUserSlot: null,
  };
}
