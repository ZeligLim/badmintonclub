"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  LoaderCircle,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClubSession } from "@/features/sessions";
import Link from "next/link";

type SessionSignupState = {
  registeredCount: number;
  currentUserStatus: string | null;
};

type SessionCardProps = {
  session: ClubSession;
  signupState: SessionSignupState;
  isDemo: boolean;
  isSignedIn: boolean;
  isPending: boolean;
  canMarkPlayed: boolean;
  hasBeenPlayed: boolean;
  onSignup: () => void;
  onMarkPlayed: () => void;
};

export function SessionCard({
  session,
  signupState,
  isDemo,
  isSignedIn,
  isPending,
  canMarkPlayed,
  hasBeenPlayed,
  onSignup,
  onMarkPlayed,
}: SessionCardProps) {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(() => setCurrentTime(Date.now()), 1_000);

    return () => clearInterval(intervalId);
  }, []);

  const remainingPlaces = Math.max(
    session.capacity - signupState.registeredCount,
    0,
  );
  const signupStatus = signupState.currentUserStatus?.toLowerCase() ?? "";
  const isWaitlisted = signupStatus.includes("waitlist");
  const isPlayed = signupStatus === "played";
  const isSignedUp = signupStatus.length > 0 && !isPlayed;
  const isConfirmed = session.status.toLowerCase() === "confirmed";
  const signupOpensAt = new Date(session.signupOpensAt).getTime();
  const confirmationAt = new Date(session.confirmationAt).getTime();
  const isSignupOpen =
    session.status === "open" &&
    signupOpensAt <= currentTime &&
    currentTime < confirmationAt;
  const isSignupScheduled =
    session.status === "open" && currentTime < signupOpensAt;
  const actionLabel = isWaitlisted
    ? "Leave waitlist"
    : isSignedUp
      ? "Cancel place"
      : remainingPlaces > 0
        ? "Join session"
        : "Join waitlist";
  const unavailableActionLabel = isSignupScheduled
    ? `Opens ${formatRuleDate(session.signupOpensAt)}`
    : "Sign-ups closed";

  return (
    <article className="overflow-hidden rounded-2xl bg-white">
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Evening session
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-lg font-medium tracking-tight">
                  {formatSessionTime(session.startsAt)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    · {formatDuration(session.durationMinutes)}
                  </span>
                </h3>
                <p className="text-sm font-medium text-muted-foreground">
                  {session.dayName}, {formatSessionDate(session.date)}
                </p>
              </div>
            </div>
            <SessionStatus
              status={signupStatus}
              isConfirmed={isConfirmed}
              isSignedIn={isSignedIn}
            />
          </div>

          <div className="mt-4 flex items-center gap-3 py-2">
            <UsersRound aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium tabular-nums">
                {isConfirmed ? (
                  <>
                    {signupState.registeredCount}/{session.capacity}{" "}
                    <span className="font-normal text-muted-foreground">
                      players confirmed
                    </span>
                  </>
                ) : (
                  <>
                    {remainingPlaces}{" "}
                    <span className="font-normal text-muted-foreground">
                      {remainingPlaces === 1 ? "place" : "places"} available
                    </span>
                  </>
                )}
              </p>
            </div>
            <div
              aria-label={`${signupState.registeredCount} of ${session.capacity} places filled`}
              className="capacity-track"
              role="img"
            >
              <span
                style={{
                  width: `${Math.min(
                    (signupState.registeredCount / session.capacity) * 100,
                    100,
                  )}%`,
                }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {signupState.registeredCount}/{session.capacity}
            </span>
          </div>

          <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <Clock3 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <p>
              Sign-ups close {formatRuleDateTime(session.confirmationAt)} ·
              final players and slots confirmed then
            </p>
          </div>

          {isConfirmed && (
            <div className="mt-4 p-3.5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                  Confirmed court groups
                </p>
                {signupState.currentUserStatus &&
                  session.currentUserSlot != null && (
                    <span className="rounded-full bg-accent px-2.5 py-1 text-[0.65rem] font-semibold text-accent-foreground">
                      Your slot · {session.currentUserSlot}
                    </span>
                  )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {session.timeSlots.map((timeSlot) => (
                  <div
                    className="rounded-lg px-3 py-2"
                    key={timeSlot.number}
                  >
                    <p className="mb-1 flex items-center justify-between text-xs font-medium">
                      <span>Slot {timeSlot.number}</span>
                      <span className="text-muted-foreground">
                        {formatSessionTime(timeSlot.startAt)}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {timeSlot.players
                        .map((player) => player.displayName)
                        .join(" · ") || "Players to be confirmed"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isWaitlisted && (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-800">
              <Clock3 aria-hidden="true" className="size-3.5" />
              You’re on the waitlist. We’ll let you know if a place opens.
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            {isDemo ? (
              <span className="text-[0.68rem] text-muted-foreground">
                Demo changes stay local
              </span>
            ) : !isSignedIn ? (
              <Link
                className="text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href="/sign-in"
              >
                Sign in to join
              </Link>
            ) : (
              <span className="text-[0.68rem] text-muted-foreground">
                {isPlayed
                  ? "Attendance recorded"
                  : isSignedUp
                    ? "Your session"
                    : "A place on court"}
              </span>
            )}
            {!isPlayed && session.status === "open" && (
              <Button
                className="h-auto min-h-10 py-2.5"
                disabled={
                  isPending ||
                  !isSignupOpen ||
                  (!isDemo && !isSignedIn)
                }
                onClick={onSignup}
                size="sm"
                variant={isSignedUp ? "secondary" : "default"}
              >
                {isPending ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                    Updating
                  </>
                ) : (
                  <>
                    {isSignupOpen ? (
                      <>
                        {isSignedUp && <Check aria-hidden="true" />}
                        {actionLabel}
                        {!isSignedUp && <ArrowRight aria-hidden="true" />}
                      </>
                    ) : (
                      unavailableActionLabel
                    )}
                  </>
                )}
              </Button>
            )}
          </div>
          {(canMarkPlayed || hasBeenPlayed) && (
            <div className="mt-3 flex items-center justify-between gap-3 pt-2">
              <p className="text-xs text-muted-foreground">
                {hasBeenPlayed
                  ? "Attendance recorded for fairness tracking."
                  : "Played this session? Check in to update your play history."}
              </p>
              {canMarkPlayed && (
                <Button
                  className="h-auto min-h-10 shrink-0 py-2.5"
                  disabled={isPending}
                  onClick={onMarkPlayed}
                  size="sm"
                  variant="secondary"
                >
                  {isPending ? (
                    <>
                      <LoaderCircle aria-hidden="true" className="animate-spin" />
                      Saving
                    </>
                  ) : (
                    "Mark played"
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function SessionStatus({
  status,
  isConfirmed,
  isSignedIn,
}: {
  status: string;
  isConfirmed: boolean;
  isSignedIn: boolean;
}) {
  if (status.includes("waitlist")) {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[0.65rem] font-semibold text-amber-900">
        Not confirmed
      </span>
    );
  }

  if (status) {
    if (status === "requested") {
      return (
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.65rem] font-semibold text-secondary-foreground">
          Awaiting confirmation
        </span>
      );
    }

    if (status === "played") {
      return (
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold text-primary">
          Played
        </span>
      );
    }

    if (status === "selected") {
      return (
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold text-primary">
          Confirmed
        </span>
      );
    }

    return (
      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold text-primary">
        {isConfirmed ? "Not signed up" : "Not confirmed"}
      </span>
    );
  }

  if (isConfirmed) {
    return (
      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold text-primary">
        {isSignedIn ? "Not signed up" : "Session confirmed"}
      </span>
    );
  }

  return null;
}

function formatSessionDate(value: string) {
  const date = parseSessionDate(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatRuleDate(value: string) {
  const date = parseSessionDate(value);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatRuleDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function parseSessionDate(value: string) {
  return new Date(value.includes("T") ? value : `${value}T12:00:00`);
}

function formatSessionTime(value: string) {
  if (/^\d{1,2}:\d{2}/.test(value)) {
    return value.slice(0, 5);
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function formatDuration(durationMinutes: number) {
  const hours = durationMinutes / 60;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}
