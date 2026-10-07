"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cancelSignupForSession,
  finalizeDueSessions,
  markSessionPlayed,
  signUpForSession,
} from "@/features/sessions";
import { getUpcomingSchedule, londonDateTime } from "@/lib/sessions/schedule";
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
  isSessionInProgress,
  isSessionViewVisible,
} from "../session-timing";
import { useBrowserClock } from "../use-browser-clock";
import { SessionsHeader } from "./SessionsHeader";
import { SessionCard } from "./SessionCard";
import { DemoClock } from "./DemoClock";
import { DemoSignupCountsControl } from "./DemoSignupCountsControl";
import type {
  ClubSession,
  DashboardData,
  DemoSignupCounts,
} from "@/features/sessions";

type SessionsDashboardProps = {
  initialData: DashboardData;
};

export function SessionsDashboard({ initialData }: SessionsDashboardProps) {
  const router = useRouter();
  const [demoSessions, setDemoSessions] = useState<DemoSessionState[]>(() =>
    initialData.sessions.map((session, index) =>
      createDemoSessionState(session, index),
    ),
  );
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [demoTimeOverride, setDemoTimeOverride] = useState<Date | null>(null);
  const [demoSignupCounts, setDemoSignupCounts] = useState<DemoSignupCounts>(
    DEFAULT_DEMO_SIGNUP_COUNTS,
  );
  const finalizedSessionIds = useRef(new Set<string>());
  const isFinalizationPending = useRef(false);
  const isScheduleRefreshPending = useRef(false);
  const [playedSessionIds, setPlayedSessionIds] = useState<Set<string>>(
    () =>
      new Set(
        initialData.sessions
          .filter((session) => session.currentUserStatus === "played")
          .map((session) => session.id),
      ),
  );
  const [errorMessage, setErrorMessage] = useState("");
  const currentTime = useBrowserClock();
  const isDemo = initialData.mode === "demo";
  const sessionClockTime = demoTimeOverride ?? currentTime;
  const sessions =
    isDemo && sessionClockTime
      ? createDemoDashboardData(sessionClockTime, demoSignupCounts).sessions.map(
          (session) => ({
            ...session,
            status: getDemoSessionStatus(session, sessionClockTime),
          }),
        )
      : initialData.sessions;

  useEffect(() => {
    if (isDemo || !sessionClockTime) {
      return;
    }

    const expectedDates = getUpcomingSchedule(sessionClockTime).sessions.map(
      ({ date }) => date,
    );
    const hasScheduleChanged = expectedDates.some(
      (date) => !sessions.some((session) => session.date === date),
    );

    if (!hasScheduleChanged) {
      isScheduleRefreshPending.current = false;
      return;
    }
    if (isScheduleRefreshPending.current) {
      return;
    }

    isScheduleRefreshPending.current = true;
    router.refresh();
  }, [isDemo, router, sessionClockTime, sessions]);

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

  async function changeSignup(session: ClubSession) {
    setErrorMessage("");
    setPendingSessionId(session.id);

    try {
      if (isDemo) {
        updateDemoSession(session);
        return;
      }

      if (session.currentUserStatus) {
        await cancelSignupForSession(session.id);
      } else {
        await signUpForSession(session.id);
      }

      router.refresh();
    } catch {
      setErrorMessage("We couldn’t update your place. Please try again.");
    } finally {
      setPendingSessionId(null);
    }
  }

  async function recordPlayedSession(sessionId: string) {
    setErrorMessage("");
    setPendingSessionId(sessionId);

    try {
      await markSessionPlayed(sessionId);
      setPlayedSessionIds((currentIds) => new Set(currentIds).add(sessionId));
      router.refresh();
    } catch {
      setErrorMessage("We couldn’t record your attendance. Please try again.");
    } finally {
      setPendingSessionId(null);
    }
  }

  function updateDemoSession(session: ClubSession) {
    const storedSession =
      demoSessions.find(({ sessionId }) => sessionId === session.id) ??
      createDemoSessionState(session, -1);
    const updatedSession = toggleDemoSignup(
      {
        ...storedSession,
        registeredCount: demoSignupCounts[session.dayName],
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
        demoSignupCounts[session.dayName],
      );
    }

    return {
      registeredCount: session.registeredCount,
      currentUserStatus: session.currentUserStatus,
      currentUserSlot: session.currentUserSlot,
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

              return (
                <SessionCard
                  key={session.id}
                  session={session}
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
                  isDemo={isDemo}
                  isSignedIn={Boolean(initialData.user)}
                  isPending={pendingSessionId === session.id}
                  onSignup={() => changeSignup(session)}
                  canMarkPlayed={
                    !isDemo &&
                    Boolean(initialData.user) &&
                    session.currentUserStatus === "selected" &&
                    !playedSessionIds.has(session.id) &&
                    sessionClockTime !== null &&
                    getSessionPeriod(session, sessionClockTime) === "over"
                  }
                  hasBeenPlayed={playedSessionIds.has(session.id)}
                  onMarkPlayed={() => recordPlayedSession(session.id)}
                />
              );
            })}
          </div>
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
