"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cancelSignupForSession,
  addFriendToList,
  finalizeDueSessions,
  joinConfirmedSessionFcfs,
  saveSessionFriendPreferences,
  removeFriendFromList,
  signUpForSession,
} from "@/features/sessions";
import {
  getSessionPeriod,
  getSignupWindowStatus,
  getSessionStartTimestamp,
  isSessionInProgress,
  isSessionViewVisible,
} from "../session-timing";
import type { SessionSignupStatus } from "../types";
import { useServerClock } from "../use-server-clock";
import { SessionsHeader } from "./SessionsHeader";
import { RealNamePrompt } from "./RealNamePrompt";
import { SessionCard } from "./SessionCard";
import { FriendListCard } from "./FriendListCard";
import type {
  ClubSession,
  DashboardData,
  FriendCandidate,
} from "@/features/sessions";
import { logError, logWarning } from "@/lib/log";

type SessionsDashboardProps = {
  initialData: DashboardData;
};

type SignupOverride = {
  sourceStatus: Exclude<SessionSignupStatus, "cancelled"> | null;
  sourceSlot: number | null;
  currentUserStatus: Exclude<SessionSignupStatus, "cancelled"> | null;
  currentUserSlot: number | null;
};

export function SessionsDashboard({ initialData }: SessionsDashboardProps) {
  const router = useRouter();
  const serverFriendList = initialData.user?.friendList;
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [signupOverrides, setSignupOverrides] = useState<
    Record<string, SignupOverride>
  >({});
  const [previousServerSessions, setPreviousServerSessions] = useState(
    initialData.sessions,
  );
  const [friendList, setFriendList] = useState(
    serverFriendList ?? [],
  );
  const [previousServerFriendList, setPreviousServerFriendList] =
    useState(serverFriendList);
  const [pendingFriendId, setPendingFriendId] = useState<string | null>(null);
  const finalizedSessionIds = useRef(new Set<string>());
  const isFinalizationPending = useRef(false);
  const isScheduleRefreshPending = useRef(false);
  const [errorMessage, setErrorMessage] = useState("");
  const currentTime = useServerClock(initialData.serverNow);
  const sessionClockTime = currentTime;
  const sessions = initialData.sessions;

  if (serverFriendList !== previousServerFriendList) {
    setPreviousServerFriendList(serverFriendList);
    setFriendList(serverFriendList ?? []);
  }

  if (initialData.sessions !== previousServerSessions) {
    setPreviousServerSessions(initialData.sessions);
    setSignupOverrides((currentOverrides) => {
      let hasChanged = false;
      const nextOverrides = { ...currentOverrides };

      for (const session of initialData.sessions) {
        const override = nextOverrides[session.id];
        if (
          override &&
          (session.currentUserStatus !== override.sourceStatus ||
            session.currentUserSlot !== override.sourceSlot)
        ) {
          delete nextOverrides[session.id];
          hasChanged = true;
        }
      }

      return hasChanged ? nextOverrides : currentOverrides;
    });
  }

  useEffect(() => {
    if (!sessionClockTime || !initialData.nextScheduleChangeAt) {
      return;
    }

    // The server tells us when the club week rolls over to the next set of
    // sessions, so the page refreshes itself at that moment.
    const hasScheduleChanged =
      sessionClockTime.getTime() >=
      new Date(initialData.nextScheduleChangeAt).getTime();

    if (!hasScheduleChanged) {
      isScheduleRefreshPending.current = false;
      return;
    }
    if (isScheduleRefreshPending.current) {
      return;
    }

    isScheduleRefreshPending.current = true;
    router.refresh();
  }, [initialData.nextScheduleChangeAt, router, sessionClockTime]);

  useEffect(() => {
    if (
      !initialData.user ||
      !sessionClockTime ||
      isFinalizationPending.current
    ) {
      return;
    }

    const dueSessions = sessions.filter(
      (session) =>
        session.status === "open" &&
        sessionClockTime.getTime() >=
          new Date(session.confirmationAt).getTime() &&
        getSessionPeriod(session, sessionClockTime) !== "over" &&
        !finalizedSessionIds.current.has(session.id),
    );
    if (dueSessions.length === 0) {
      return;
    }

    dueSessions.forEach(({ id }) => finalizedSessionIds.current.add(id));
    isFinalizationPending.current = true;

    void finalizeDueSessions()
      .then(() => {
        setErrorMessage("");
        router.refresh();
      })
      .catch((error: unknown) => {
        dueSessions.forEach(({ id }) => finalizedSessionIds.current.delete(id));
        logError("Could not confirm due club sessions.", error);
        setErrorMessage("We couldn’t confirm players for this session. Please try again.");
      })
      .finally(() => {
        isFinalizationPending.current = false;
      });
  }, [initialData.user, router, sessionClockTime, sessions]);

  async function changeSignup(session: ClubSession, friendIds: string[] = []) {
    setErrorMessage("");
    setPendingSessionId(session.id);

    try {
      const currentUserStatus = getSignupState(session).currentUserStatus;
      const isCancelling = currentUserStatus !== null;
      if (isCancelling) {
        await cancelSignupForSession(session.id);
      } else if (session.status === "confirmed") {
        await joinConfirmedSessionFcfs(session.id);
        if (friendIds.length > 0) {
          try {
            await saveSessionFriendPreferences(session.id, friendIds);
          } catch (error: unknown) {
            logWarning("Could not save friend preferences upon joining confirmed session.", {
              errorType: error instanceof Error ? error.name : "unknown",
            });
          }
        }
      } else {
        await signUpForSession(session.id, friendIds);
      }

      const immediateConfirmSignup =
        !isCancelling &&
        session.status === "open" &&
        (session.allocationMode === "fcfs" || initialData.user?.isCommittee);

      if (immediateConfirmSignup) {
        setSignupOverrides((currentOverrides) => {
          if (!currentOverrides[session.id]) {
            return currentOverrides;
          }

          const nextOverrides = { ...currentOverrides };
          delete nextOverrides[session.id];
          return nextOverrides;
        });
      } else {
        setSignupOverrides((currentOverrides) => ({
          ...currentOverrides,
          [session.id]: {
            sourceStatus: session.currentUserStatus,
            sourceSlot: session.currentUserSlot,
            currentUserStatus: isCancelling
              ? null
              : session.status === "confirmed"
                ? "selected"
                : "requested",
            currentUserSlot: isCancelling ? null : session.currentUserSlot,
          },
        }));
      }
      router.refresh();
    } catch (error: unknown) {
      logError("Could not update a session signup.", {
        errorType: error instanceof Error ? error.name : "unknown",
      });
      setErrorMessage("We couldn’t update your place. Please try again.");
    } finally {
      setPendingSessionId(null);
    }
  }

  async function saveFriendPreferences(
    session: ClubSession,
    friendIds: string[],
  ): Promise<void> {
    setErrorMessage("");
    setPendingSessionId(session.id);

    try {
      await saveSessionFriendPreferences(session.id, friendIds);
      router.refresh();
    } catch (error: unknown) {
      logError("Could not save session friend choices.", {
        errorType: error instanceof Error ? error.name : "unknown",
      });
      setErrorMessage("We couldn’t save your friend choices. Please try again.");
      throw new Error("Could not save your friend choices.");
    } finally {
      setPendingSessionId(null);
    }
  }

  async function addFriendToSharedList(friend: FriendCandidate): Promise<void> {
    setErrorMessage("");
    try {
      await addFriendToList(friend.userId);
    } catch (error: unknown) {
      logError("Could not add a friend to the shared list.", {
        errorType: error instanceof Error ? error.name : "unknown",
      });
      throw error;
    }
    setFriendList((currentFriends) => [
      friend,
      ...currentFriends.filter(
        (currentFriend) => currentFriend.userId !== friend.userId,
      ),
    ]);
  }

  async function removeFriendFromSharedList(friendId: string): Promise<void> {
    setErrorMessage("");
    setPendingFriendId(friendId);
    try {
      await removeFriendFromList(friendId);
      setFriendList((currentFriends) =>
        currentFriends.filter((friend) => friend.userId !== friendId),
      );
    } catch (error: unknown) {
      logError("Could not remove a friend from the shared list.", {
        errorType: error instanceof Error ? error.name : "unknown",
      });
      setErrorMessage("We couldn’t remove this friend. Please try again.");
    } finally {
      setPendingFriendId(null);
    }
  }

  function getSignupState(session: ClubSession) {
    const serverState = {
      registeredCount: session.registeredCount,
      currentUserStatus: session.currentUserStatus,
      currentUserSlot: session.currentUserSlot,
    };
    const override = signupOverrides[session.id];

    if (
      !override ||
      serverState.currentUserStatus !== override.sourceStatus ||
      serverState.currentUserSlot !== override.sourceSlot
    ) {
      return serverState;
    }

    return {
      ...serverState,
      currentUserStatus: override.currentUserStatus,
      currentUserSlot: override.currentUserSlot,
    };
  }

  return (
    <main
      className="min-h-screen px-5 pb-12 pt-3 sm:px-8 sm:pt-5"
      id="main"
    >
      <div className="mx-auto w-full max-w-6xl">
        <SessionsHeader
          displayName={initialData.user?.displayName ?? null}
          isCommittee={initialData.user?.isCommittee ?? false}
          isCommitteeAdmin={initialData.user?.isCommitteeAdmin ?? false}
          committeeAutoSignup={initialData.user?.committeeAutoSignup ?? false}
          playerLevel={initialData.user?.playerLevel ?? "INTERMEDIATE"}
          canChooseProfessional={initialData.user?.canChooseProfessional ?? false}
        />
        {initialData.user ? (
          <RealNamePrompt
            displayName={initialData.user.displayName}
            userId={initialData.user.id}
          />
        ) : null}
        <h1 className="sr-only">ATU Galway Badminton Club</h1>

        <section aria-label="Club sessions" className="mt-7 sm:mt-10">
          <div className="grid gap-4 lg:grid-cols-2">
            {sessions.map((session) => {
              const signupState = getSignupState(session);
              const friendSelectionKey = JSON.stringify(
                (session.friendCandidates ?? [])
                  .filter((candidate) => candidate.isSelected)
                  .map((candidate) => candidate.userId)
                  .sort(),
              );

              return (
                <SessionCard
                  key={`${session.id}:${friendSelectionKey}`}
                  session={session}
                  currentUserId={initialData.user?.id ?? null}
                  signupState={signupState}
                  showSessionView={
                    sessionClockTime !== null &&
                    isSessionViewVisible(session, sessionClockTime)
                  }
                  isSessionInProgress={
                    sessionClockTime !== null &&
                    isSessionInProgress(session, sessionClockTime)
                  }
                  isSessionOver={
                    sessionClockTime !== null &&
                    getSessionPeriod(session, sessionClockTime) === "over"
                  }
                  signupWindowStatus={
                    sessionClockTime === null
                      ? "not-open"
                      : getSignupWindowStatus(session, sessionClockTime)
                  }
                  isPastCancellationDeadline={
                    sessionClockTime !== null &&
                    sessionClockTime.getTime() >=
                      getSessionStartTimestamp(session) - 30 * 60_000
                  }
                  isSignedIn={Boolean(initialData.user)}
                  isPending={pendingSessionId === session.id}
                  friendList={friendList}
                  onAddToFriendList={addFriendToSharedList}
                  onSignup={(friendIds) => changeSignup(session, friendIds)}
                  onSaveFriendPreferences={(friendIds) =>
                    saveFriendPreferences(session, friendIds)
                  }
                />
              );
            })}
          </div>
          {initialData.user && (
            <FriendListCard
              friends={friendList}
              onRemove={(friendId) => void removeFriendFromSharedList(friendId)}
              pendingFriendId={pendingFriendId}
            />
          )}
        </section>

        {errorMessage && (
          <p
            aria-live="assertive"
            className="mt-4 text-sm text-destructive"
            role="alert"
          >
            {errorMessage}
          </p>
        )}

      </div>
    </main>
  );
}
