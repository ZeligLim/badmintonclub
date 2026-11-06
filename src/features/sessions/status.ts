import type { SessionSignupStatus, SessionStatus } from "./types";

const SESSION_STATUSES: readonly SessionStatus[] = [
  "open",
  "confirmed",
  "closed",
  "cancelled",
];

const SIGNUP_STATUSES: readonly SessionSignupStatus[] = [
  "requested",
  "selected",
  "waitlisted",
  "played",
  "cancelled",
];

export function isSessionStatus(value: string): value is SessionStatus {
  return (SESSION_STATUSES as readonly string[]).includes(value);
}

export function isSignupStatus(value: string): value is SessionSignupStatus {
  return (SIGNUP_STATUSES as readonly string[]).includes(value);
}

/** Narrow a database string at the boundary; anything else is a bug. */
export function toSessionStatus(value: string): SessionStatus {
  if (!isSessionStatus(value)) {
    throw new Error(`Unknown session status: ${value}`);
  }

  return value;
}

export function toSignupStatus(value: string): SessionSignupStatus {
  if (!isSignupStatus(value)) {
    throw new Error(`Unknown signup status: ${value}`);
  }

  return value;
}
