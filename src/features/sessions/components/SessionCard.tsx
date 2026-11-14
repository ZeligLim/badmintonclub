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
  formatDuration,
  formatFee,
  formatRuleDateTime,
  formatSessionDate,
  formatTimeOfDay,
} from "@/lib/format";
import type { ClubSession, FriendCandidate } from "@/features/sessions";
import Link from "next/link";
import { useState } from "react";
import type { SessionSignupStatus as SignupStatus } from "../types";
import { SessionFriendPicker } from "./SessionFriendPicker";
import { SessionSignupStatus } from "./SessionSignupStatus";

type SessionSignupState = {
  registeredCount: number;
  currentUserStatus: Exclude<SignupStatus, "cancelled"> | null;
  currentUserSlot: number | null;
};

type SessionCardProps = {
  session: ClubSession;
  currentUserId: string | null;
  signupState: SessionSignupState;
  showSessionView: boolean;
  isSessionInProgress: boolean;
  isSessionOver: boolean;
  signupWindowStatus: "not-open" | "open" | "closed";
  /** True once the clock passes session start − 30 min. The timetable is released at that point and no further changes are accepted. */
  isPastCancellationDeadline: boolean;
  isSignedIn: boolean;
  isPending: boolean;
  friendList: FriendCandidate[];
  onSignup: (friendIds: string[]) => void;
  onAddToFriendList: (friend: FriendCandidate) => Promise<void>;
  onSaveFriendPreferences: (friendIds: string[]) => Promise<void>;
};

export function SessionCard({
  session,
  signupState,
  showSessionView,
  isSessionInProgress,
  isSessionOver,
  signupWindowStatus,
  isPastCancellationDeadline,
  isSignedIn,
  isPending,
  friendList,
  onSignup,
  onAddToFriendList,
  onSaveFriendPreferences,
}: SessionCardProps) {
  const friendCandidates = session.friendCandidates ?? [];
  const [selectedFriendIds, setSelectedFriendIds] = useState(() => {
    const savedFriendIds = friendList
      .map((friend) => friend.userId)
      .filter((userId) =>
        friendCandidates.some((candidate) => candidate.userId === userId),
      );
    const selectedFromSession = friendCandidates
      .filter((candidate) => candidate.isSelected)
      .map((candidate) => candidate.userId);
    return Array.from(new Set([...selectedFromSession, ...savedFriendIds]));
  });

   const signupStatus = signupState.currentUserStatus ?? "";
  const isWaitlisted = signupStatus === "waitlisted";
  const isPlayed = signupStatus === "played";
  const isSignedUp = signupStatus.length > 0 && !isPlayed;
  const isConfirmed =
    session.status === "confirmed" || session.status === "closed";
  const playerGameSchedule =
    signupStatus === "selected" ? session.playerGameSchedule ?? [] : [];
  const hasFcfsSpace =
    session.status === "confirmed" &&
    !isPastCancellationDeadline &&
    signupState.registeredCount < session.capacity;
  const isFirstComeFirstServed = session.allocationMode === "fcfs";
  const feeLabel = formatFee(session.feeCents);
  const actionLabel = isWaitlisted
    ? "Leave waitlist"
    : isSignedUp
      ? "Cancel place"
      : signupWindowStatus === "not-open" && !hasFcfsSpace
        ? "Sign-ups not open"
        : "Join session";
  const canCancelSignup =
    isSignedUp &&
    !isSessionInProgress &&
    !isSessionOver &&
    !isPastCancellationDeadline &&
    (session.status === "confirmed" || session.status === "open");
  const canJoinSession =
    !isSignedUp &&
    !isPastCancellationDeadline &&
    !isSessionInProgress &&
    !isSessionOver &&
    (session.status === "open" || hasFcfsSpace) &&
    (session.status !== "open" || signupWindowStatus !== "closed");

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
            {session.needsAttention ? (
              <p className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
                This session has a value the app does not recognise. Ask a
                committee member to check it.
              </p>
            ) : null}
            {session.timetableOutdated ? (
              <p className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
                This released timetable was built by an older version of the app. A
                committee member can repair it from the admin page.
              </p>
            ) : null}
            <h3 className="text-lg font-medium tracking-tight">
              {formatTimeOfDay(session.startsAt)}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                · {formatDuration(session.durationMinutes)}
              </span>
            </h3>
            <p className="text-sm font-medium text-muted-foreground">
              {session.dayName}, {formatSessionDate(session.date)} ·{" "}
              {session.courtCount} courts
              {session.feeCents > 0 ? (
                <>
                  {" · "}
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {feeLabel} / person
                  </span>
                </>
              ) : (
                <>
                  {" · "}
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Free
                  </span>
                </>
              )}
            </p>
          </div>

          {session.feeCents > 0 && session.status !== "cancelled" && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50/70 px-3.5 py-2 text-xs text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-200">
              <span className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-200 font-bold text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100">
                  €
                </span>
                <span>
                  Need to pay <strong>{feeLabel} per person</strong> to play
                </span>
              </span>
              <span className="text-[0.7rem] font-medium text-emerald-700 dark:text-emerald-300">
                Pay on arrival
              </span>
            </div>
          )}

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
                      players {isConfirmed || isFirstComeFirstServed ? "confirmed" : "signed up"}
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
                {isPastCancellationDeadline ? (
                  <p>
                    Timetable released ·{" "}
                    <span className="font-medium text-foreground">session locked</span>{" "}
                    (no further changes)
                  </p>
                ) : hasFcfsSpace ? (
                  <p>
                    Session confirmed · spaces still available on a{" "}
                    <span className="font-medium text-foreground">first-come, first-served</span>{" "}
                    basis
                    {session.feeCents > 0 ? (
                      <>
                        {" · "}
                        <span className="font-semibold text-foreground">{feeLabel} per person</span>
                      </>
                    ) : (
                      <>
                        {" · "}
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">Free</span>
                      </>
                    )}
                  </p>
                ) : isFirstComeFirstServed ? (
                  <p>
                    First-come, first-served ·{" "}
                    <span className="font-semibold text-foreground">
                      {session.feeCents > 0 ? `${feeLabel} per person` : "Free"}
                    </span>{" "}
                    ·{" "}
                    {signupWindowStatus === "not-open" ? (
                      <>
                        sign-ups open{" "}
                        <span className="font-medium text-foreground">
                          {formatRuleDateTime(session.signupOpensAt)}
                        </span>
                      </>
                    ) : (
                      <>
                        sign-ups open until{" "}
                        {formatRuleDateTime(session.confirmationAt)}
                      </>
                    )}
                  </p>
                ) : signupWindowStatus === "not-open" ? (
                  <p>
                    Sign-ups open{" "}
                    <span className="font-medium text-foreground">
                      {formatRuleDateTime(session.signupOpensAt)}
                    </span>
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
              <p className="mb-2 text-sm font-semibold text-foreground">
                Your games
              </p>
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                {playerGameSchedule.map((game) => (
                  <li
                    key={`${game.startAt}-${game.courtNumber}`}
                    className="rounded-xl bg-primary/5 p-3 text-foreground"
                  >
                    <div className="font-semibold text-primary">
                      Court {game.courtNumber} ·{" "}
                      {formatTimeOfDay(game.startAt)}–
                      {formatTimeOfDay(game.endAt)}
                    </div>
                    {game.courtPlayers.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        with{" "}
                        <span className="font-medium text-foreground">
                          {game.courtPlayers.join(", ")}
                        </span>
                      </p>
                    )}
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
            !isPlayed &&
            session.status !== "cancelled" &&
            !isSessionInProgress &&
            !isSessionOver &&
            !isPastCancellationDeadline &&
            (isSignedUp || canJoinSession) && (
              <SessionFriendPicker
                friendCandidates={friendCandidates}
                friendList={friendList}
                isAlreadySignedUp={isSignedUp}
                isPending={isPending}
                sessionId={session.id}
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
            {!isSessionOver && (
              <>
                {!isSignedIn && session.status !== "cancelled" ? (
                  <Link
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href="/sign-in"
                  >
                    Sign in to join
                  </Link>
                ) : null}
              </>
            )}
            {!isPlayed &&
              session.status !== "cancelled" &&
              (canCancelSignup || canJoinSession) && (
              <Button
                className="h-auto min-h-10 py-2.5"
                disabled={
                  isPending ||
                  (session.status === "open" && !isSignedUp && signupWindowStatus !== "open") ||
                  !isSignedIn
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
          {null}
        </div>
      </div>
    </article>
  );
}
