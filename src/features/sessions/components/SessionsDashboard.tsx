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
import { londonDateTime } from "@/lib/sessions/schedule";
import {
  createDemoDashboardData,
  DEFAULT_DEMO_SIGNUP_COUNTS,
} from "../demo-data";
import {
  createDemoSessionState,
  getDemoSignupState,
  getDemoSessionStatus,
  toggleDemoSignup,
  type DemoSessionState,
} from "../demo-session-state";
import {
  getSessionPeriod,
  getSignupWindowStatus,
  getSessionStartTimestamp,
  isSessionInProgress,
  isSessionViewVisible,
} from "../session-timing";
import { useBrowserClock } from "../use-browser-clock";
import { createClient } from "@/lib/supabase/client";import { SessionsHeader } from "./SessionsHeader";
import { SessionCard } from "./SessionCard";
import { FriendListCard } from "./FriendListCard";
import { DemoClock } from "./DemoClock";
import { DemoSignupCountsControl } from "./DemoSignupCountsControl";
import type {
  ClubSession,
  DashboardData,
  DemoSignupCounts,
  FriendCandidate,
} from "@/features/sessions";

type SessionsDashboardProps = {
  initialData: DashboardData;
};

type SignupOverride = {
  sourceStatus: string | null;
  sourceSlot: number | null;
  currentUserStatus: string | null;
  currentUserSlot: number | null;
};

export function SessionsDashboard({ initialData }: SessionsDashboardProps) {
  const router = useRouter();
  const serverFriendList = initialData.user?.friendList;
  const [demoSessions, setDemoSessions] = useState<DemoSessionState[]>(() =>
    initialData.sessions.map((session, index) =>
      createDemoSessionState(session, index),
    ),
  );
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [signupOverrides, setSignupOverrides] = useState<
    Record<string, SignupOverride>
  >({});
  const [previousServerSessions, setPreviousServerSessions] = useState(
    initialData.sessions,
  );
  const [demoTimeOverride, setDemoTimeOverride] = useState<Date | null>(null);
  const [virtualOffset, setVirtualOffset] = useState<number | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("dev_virtual_clock")
      .select("virtual_now")
      .eq("id", 1)
      .single()
      .then(({ data, error }) => {
        if (error || !data?.virtual_now) return;
        setVirtualOffset(
          new Date(data.virtual_now).getTime() - Date.now(),
        );
      });
  }, []);  const [demoPlayerLevel, setDemoPlayerLevel] = useState<
    "BEGINNER" | "INTERMEDIATE"
  >("INTERMEDIATE");
  const [demoSignupCounts, setDemoSignupCounts] = useState<DemoSignupCounts>(
    DEFAULT_DEMO_SIGNUP_COUNTS,
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
  const currentTime = useBrowserClock();
  const appCurrentTime =
    virtualOffset !== null && currentTime !== null
      ? new Date(currentTime.getTime() + virtualOffset)
      : currentTime;
  const isDemo = initialData.mode === "demo";
  const sessionClockTime = demoTimeOverride ?? appCurrentTime;
  const sessions =
    isDemo && sessionClockTime
      ? createDemoDashboardData(sessionClockTime, demoSignupCounts).sessions.map(
          (session) => ({
            ...session,
            status: getDemoSessionStatus(session, sessionClockTime),
          }),
        )
      : initialData.sessions;

  if (serverFriendList !== previousServerFriendList) {
    setPreviousServerFriendList(serverFriendList);
    setFriendList(serverFriendList ?? []);
  }

  if (!isDemo && initialData.sessions !== previousServerSessions) {
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
    if (isDemo || !sessionClockTime || !initialData.nextScheduleChangeAt) {
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
  }, [
    initialData.nextScheduleChangeAt,
    isDemo,
    router,
    sessionClockTime,
  ]);

  useEffect(() => {
    if (
      isDemo ||
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
        console.error("Could not confirm due club sessions.", error);
        setErrorMessage("We couldn’t confirm players for this session. Please try again.");
      })
      .finally(() => {
        isFinalizationPending.current = false;
      });
  }, [initialData.user, isDemo, router, sessionClockTime, sessions]);

  async function changeSignup(session: ClubSession, friendIds: string[] = []) {
    setErrorMessage("");
    setPendingSessionId(session.id);

    try {
      if (isDemo) {
        updateDemoSession(session);
        return;
      }

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
            console.warn("Could not save friend preferences upon joining confirmed session.", {
              errorType: error instanceof Error ? error.name : "unknown",
            });
          }
        }
      } else {
        await signUpForSession(session.id, friendIds);
      }

      const immediateConfirmSignup =
        !isCancelling &&
        !isDemo &&
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
      console.error("Could not update a session signup.", {
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
      if (!isDemo) {
        await saveSessionFriendPreferences(session.id, friendIds);
        router.refresh();
      }
    } catch (error: unknown) {
      console.error("Could not save session friend choices.", {
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
      if (!isDemo) {
        await addFriendToList(friend.userId);
      }
    } catch (error: unknown) {
      console.error("Could not add a friend to the shared list.", {
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
      if (!isDemo) {
        await removeFriendFromList(friendId);
      }
      setFriendList((currentFriends) =>
        currentFriends.filter((friend) => friend.userId !== friendId),
      );
    } catch (error: unknown) {
      console.error("Could not remove a friend from the shared list.", {
        errorType: error instanceof Error ? error.name : "unknown",
      });
      setErrorMessage("We couldn’t remove this friend. Please try again.");
    } finally {
      setPendingFriendId(null);
    }
  }

  function updateDemoSession(session: ClubSession) {
    const storedSession =
      demoSessions.find(({ sessionId }) => sessionId === session.id) ??
      createDemoSessionState(session, -1);
    const updatedSession = toggleDemoSignup(
      {
        ...storedSession,
        registeredCount: demoSignupCounts[session.dayName] ?? 0,
      },
    );
    const hasSessionState = demoSessions.some(
      ({ sessionId }) => sessionId === session.id,
    );

    setDemoSessions(
      hasSessionState
        ? demoSessions.map((currentSession) =>
            currentSession.sessionId === session.id
              ? updatedSession
              : currentSession,
          )
        : [...demoSessions, updatedSession],
    );
    setDemoSignupCounts((currentCounts) => ({
      ...currentCounts,
      [session.dayName]: updatedSession.registeredCount,
    }));
  }

  function getSignupState(session: ClubSession) {
    if (isDemo) {
      const storedState = demoSessions.find(
        (demoSession) => demoSession.sessionId === session.id,
      );
      return getDemoSignupState(
        session,
        storedState,
        demoSignupCounts[session.dayName] ?? 0,
      );
    }

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

  function changeDemoSignupCount(
    dayName: keyof DemoSignupCounts,
    count: number,
  ) {
    setDemoSignupCounts((currentCounts) => ({
      ...currentCounts,
      [dayName]: count,
    }));
    setDemoSessions((currentSessions) =>
      currentSessions.map((demoSession) =>
        demoSession.dayName === dayName
          ? {
              ...demoSession,
              registeredCount: count,
              currentUserStatus:
                count === 0 ? null : demoSession.currentUserStatus,
              currentUserSlot: count === 0 ? null : demoSession.currentUserSlot,
            }
          : demoSession,
      ),
    );
  }

  function changeDemoTime(value: string) {
    setDemoTimeOverride(
      value ? parseLondonDateTimeInput(value) : null,
    );
  }

  return (
    <main
      className="min-h-screen px-5 pb-12 pt-3 sm:px-8 sm:pt-5"
      id="main"
    >
      <div className="mx-auto w-full max-w-6xl">
        <SessionsHeader
          isDemo={isDemo}
          displayName={initialData.user?.displayName ?? null}
          isCommittee={initialData.user?.isCommittee ?? false}
          isCommitteeAdmin={initialData.user?.isCommitteeAdmin ?? false}
          committeeAutoSignup={initialData.user?.committeeAutoSignup ?? false}
          playerLevel={
            isDemo
              ? demoPlayerLevel
              : initialData.user?.playerLevel ?? "INTERMEDIATE"
          }
          canChooseProfessional={
            !isDemo && (initialData.user?.canChooseProfessional ?? false)
          }
          onDemoPlayerLevelChange={setDemoPlayerLevel}
        />
        <h1 className="sr-only">ATU Galway Badminton Club</h1>

        {isDemo && (
          <p className="mb-5 mt-4 text-sm text-muted-foreground">
            Demo mode · changes stay on this device
          </p>
        )}

        {isDemo && (
          <DemoClock
            isOverridden={demoTimeOverride !== null}
            onChange={changeDemoTime}
            onReset={() => setDemoTimeOverride(null)}
            value={
              sessionClockTime
                ? formatLondonDateTimeInput(sessionClockTime)
                : ""
            }
          />
        )}
        {isDemo && (
          <DemoSignupCountsControl
            onChange={changeDemoSignupCount}
            value={demoSignupCounts}
          />
        )}

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
                  isDemo={isDemo}
                  isSignedIn={isDemo || Boolean(initialData.user)}
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
          {(isDemo || initialData.user) && (
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

function parseLondonDateTimeInput(value: string) {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const selectedDate = new Date(Date.UTC(year, month - 1, day));

  return new Date(londonDateTime(selectedDate, hour, minute));
}

function formatLondonDateTimeInput(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${partValue("year")}-${partValue("month")}-${partValue("day")}T${partValue("hour")}:${partValue("minute")}`;
}
