"use client";

import {
  ArrowRight,
  Check,
  Clock3,
  LoaderCircle,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createPlayerGameSchedule,
  type ClubSession,
  type FriendCandidate,
} from "@/features/sessions";
import Link from "next/link";
import { useState } from "react";
import { SessionFriendPicker } from "./SessionFriendPicker";
import { SessionSignupStatus } from "./SessionSignupStatus";

type SessionSignupState = {
  registeredCount: number;
  currentUserStatus: string | null;
  currentUserSlot: number | null;
};

type SessionCardProps = {
  session: ClubSession;
  signupState: SessionSignupState;
  showSessionView: boolean;
  isSessionInProgress: boolean;
  isSessionOver: boolean;
  signupWindowStatus: "not-open" | "open" | "closed";
  isDemo: boolean;
  isSignedIn: boolean;
  isPending: boolean;
  friendList: FriendCandidate[];
  canMarkPlayed: boolean;
  hasBeenPlayed: boolean;
  onSignup: (friendIds: string[]) => void;
  onAddToFriendList: (friend: FriendCandidate) => Promise<void>;
  onSaveFriendPreferences: (friendIds: string[]) => Promise<void>;
  onMarkPlayed: () => void;
};

export function SessionCard({
  session,
  signupState,
  showSessionView,
  isSessionInProgress,
  isSessionOver,
  signupWindowStatus,
  isDemo,
  isSignedIn,
  isPending,
  friendList,
  canMarkPlayed,
  hasBeenPlayed,
  onSignup,
  onAddToFriendList,
  onSaveFriendPreferences,
  onMarkPlayed,
}: SessionCardProps) {
  const friendCandidates = session.friendCandidates ?? [];
  const [selectedFriendIds, setSelectedFriendIds] = useState(() =>
    friendCandidates
      .filter((candidate) => candidate.isSelected)
      .map((candidate) => candidate.userId),
  );

  const signupStatus = signupState.currentUserStatus?.toLowerCase() ?? "";
  const isWaitlisted = signupStatus.includes("waitlist");
  const isPlayed = signupStatus === "played";
  const isSignedUp = signupStatus.length > 0 && !isPlayed;
  const isConfirmed =
    session.status === "confirmed" || session.status === "closed";
  const playerGroupCount = isDemo
    ? Math.ceil(
        Math.min(signupState.registeredCount, session.capacity) /
          session.playersPerSlot,
      )
    : session.timeSlots.length;
  const currentUserSlot = signupState.currentUserSlot;
  const hasConfirmedPlayerGroup =
    signupStatus === "selected" &&
    currentUserSlot !== null &&
    currentUserSlot >= 1 &&
    currentUserSlot <= playerGroupCount;
  const playerGameSchedule = hasConfirmedPlayerGroup
    ? createPlayerGameSchedule(
        session,
        currentUserSlot,
        playerGroupCount,
      )
    : [];
  const hasFcfsSpace =
    session.status === "confirmed" &&
    signupState.registeredCount < session.capacity;
  const actionLabel = isWaitlisted
    ? "Leave waitlist"
    : isSignedUp
      ? "Cancel place"
      : signupWindowStatus === "not-open" && !hasFcfsSpace
        ? "Sign-ups not open"
        : "Join session";

  function handleSignupClick() {
    if (isSignedUp && !window.confirm("Are you sure you want to cancel?")) {
      return;
    }

    onSignup(selectedFriendIds);
  }

  return (
    <article className="overflow-hidden rounded-2xl bg-white">
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="mt-1 grid gap-y-1 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-3">
            <h3 className="text-lg font-medium tracking-tight">
              {formatSessionTime(session.startsAt)}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                · {formatDuration(session.durationMinutes)}
              </span>
            </h3>
            <p className="text-sm font-medium text-muted-foreground">
              {session.dayName}, {formatSessionDate(session.date)} ·{" "}
              {session.courtCount} courts
            </p>
          </div>

          {session.status === "cancelled" && (
            <p
              className="mt-3 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground"
              role="status"
            >
              This session is not happening. Existing sign-ups have been retained.
            </p>
          )}

          {!isSessionInProgress &&
            !isSessionOver &&
            session.status !== "cancelled" && (
            <>
              <div className="mt-4 flex items-center gap-3 py-2">
                <UsersRound aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tabular-nums">
                    {signupState.registeredCount}/{session.capacity}{" "}
                    <span className="font-normal text-muted-foreground">
                      players {isConfirmed ? "confirmed" : "signed up"}
                    </span>
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
                {hasFcfsSpace ? (
                  <p>
                    Session confirmed · spaces still available on a{" "}
                    <span className="font-medium text-foreground">first-come, first-served</span>{" "}
                    basis
                  </p>
                ) : (
                  <p>
                    Sign-ups close {formatRuleDateTime(session.confirmationAt)}
                    <span className="hidden sm:inline"> · </span>
                    <span className="block sm:inline">
                      final players and slots confirmed then
                    </span>
                  </p>
                )}
              </div>
            </>
          )}

          {showSessionView &&
            session.status !== "cancelled" &&
            playerGameSchedule.length > 0 && (
            <div aria-label="Your games" className="mt-3">
              <p className="mb-2 text-sm font-medium text-primary">
                Your games
              </p>
              <ul className="grid gap-1.5 text-sm text-primary sm:grid-cols-2">
                {playerGameSchedule.map((game) => (
                  <li key={`${game.startAt}-${game.courtNumber}`}>
                    Court {game.courtNumber} ·{" "}
                    {formatSessionTime(game.startAt)}–
                    {formatSessionTime(game.endAt)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isWaitlisted && session.status !== "cancelled" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-800">
              <Clock3 aria-hidden="true" className="size-3.5" />
              You’re on the waitlist. We’ll let you know if a place opens.
            </p>
          )}

          {isSignedIn &&
            session.status === "open" &&
            !isPlayed && (
              <SessionFriendPicker
                friendCandidates={friendCandidates}
                friendList={friendList}
                isAlreadySignedUp={isSignedUp}
                isDemo={isDemo}
                isPending={isPending}
                onAddToFriendList={onAddToFriendList}
                onChange={setSelectedFriendIds}
                onSave={onSaveFriendPreferences}
                selectedFriendIds={selectedFriendIds}
              />
            )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <SessionSignupStatus
              status={signupStatus}
              isCancelled={session.status === "cancelled"}
              isConfirmed={isConfirmed}
              isSignedIn={isSignedIn}
              isSessionInProgress={isSessionInProgress}
              isSessionOver={isSessionOver}
            />
            {!isDemo && !isSessionOver && (
              <>
                {!isSignedIn && session.status !== "cancelled" ? (
                  <Link
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href="https://badmintonclub.vercel.app/sign-in"
                  >
                    Sign in to join
                  </Link>
                ) : null}
              </>
            )}
            {!isPlayed &&
              !isSessionOver &&
              session.status !== "cancelled" &&
              (session.status === "open" || hasFcfsSpace) &&
              (session.status === "open" ? signupWindowStatus !== "closed" : true) && (
              <Button
                className="h-auto min-h-10 py-2.5"
                disabled={
                  isPending ||
                  (session.status === "open" && !isSignedUp && signupWindowStatus !== "open") ||
                  (!isDemo && !isSignedIn)
                }
                onClick={handleSignupClick}
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
                    {isSignedUp && <Check aria-hidden="true" />}
                    {actionLabel}
                    {!isSignedUp && <ArrowRight aria-hidden="true" />}
                  </>
                )}
              </Button>
            )}
          </div>
          {session.status !== "cancelled" &&
            (canMarkPlayed || hasBeenPlayed) && (
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

function formatSessionDate(value: string) {
  const date = parseSessionDate(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatRuleDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${partValue("weekday")} ${partValue("day")} ${partValue("month")} at ${partValue("hour")}:${partValue("minute")}`;
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
