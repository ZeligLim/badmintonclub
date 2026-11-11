"use client";

import { RefreshCw } from "lucide-react";

import type { ClubSession } from "../types";

/**
 * Shown once, when a saved timetable moved since the member last looked at it.
 *
 * The usual cause is a late cancellation: someone dropped out before the first
 * serve, the evening was re-drawn, and their old courts are no longer right.
 * Dismissing this records the version the member has now seen.
 */
export function TimetableChangeNotice({
  sessions,
  onDismiss,
}: {
  sessions: ClubSession[];
  onDismiss: () => void;
}) {
  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        aria-labelledby="timetable-changed-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl"
        role="alertdialog"
      >
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/10">
          <RefreshCw aria-hidden="true" className="size-5 text-primary" />
        </div>
        <h2
          className="mt-3 text-lg font-semibold text-foreground"
          id="timetable-changed-title"
        >
          Your timetable has changed
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Someone dropped out, so the games were re-drawn. Please check your
          courts before you play.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {sessions.map((session) => (
            <li
              className="rounded-lg bg-muted px-3 py-2 font-medium text-foreground"
              key={session.id}
            >
              {session.dayName} {session.date} · {session.startsAt}
            </li>
          ))}
        </ul>
        <button
          className="mt-4 flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onDismiss}
          type="button"
        >
          OK, show me my games
        </button>
      </div>
    </div>
  );
}
