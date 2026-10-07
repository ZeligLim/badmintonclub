"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  cancelSignupForSession,
  markSessionPlayed,
  signUpForSession,
} from "@/features/sessions";
import { SessionsHeader } from "./SessionsHeader";
import { SessionCard } from "./SessionCard";
import type { ClubSession, DashboardData } from "@/features/sessions";

type SessionsDashboardProps = {
  initialData: DashboardData;
};

type DemoSessionState = {
  sessionId: string;
  registeredCount: number;
  currentUserStatus: string | null;
};

export function SessionsDashboard({ initialData }: SessionsDashboardProps) {
  const router = useRouter();
  const [demoSessions, setDemoSessions] = useState<DemoSessionState[]>(() =>
    initialData.sessions.map((session) => createDemoSessionState(session)),
  );
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [playedSessionIds, setPlayedSessionIds] = useState<Set<string>>(
    () =>
      new Set(
        initialData.sessions
          .filter((session) => session.currentUserStatus === "played")
          .map((session) => session.id),
      ),
  );
  const [errorMessage, setErrorMessage] = useState("");
  const isDemo = initialData.mode === "demo";

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
    setDemoSessions((currentSessions) =>
      currentSessions.map((currentSession) => {
        if (currentSession.sessionId !== session.id) {
          return currentSession;
        }

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
          };
        }

        const hasCapacity =
          currentSession.registeredCount < session.capacity;

        return {
          ...currentSession,
          registeredCount: hasCapacity
            ? currentSession.registeredCount + 1
            : currentSession.registeredCount,
          currentUserStatus: hasCapacity ? "registered" : "waitlisted",
        };
      }),
    );
  }

  function getSignupState(session: ClubSession) {
    if (!isDemo) {
      return {
        registeredCount: session.registeredCount,
        currentUserStatus: session.currentUserStatus,
      };
    }

    return demoSessions.find(
      (demoSession) => demoSession.sessionId === session.id,
    ) ?? {
      registeredCount: session.registeredCount,
      currentUserStatus: session.currentUserStatus,
    };
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

        <section aria-label="Club sessions" className="mt-7 sm:mt-10">
          <div className="grid gap-4 lg:grid-cols-2">
            {initialData.sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                signupState={getSignupState(session)}
                isDemo={isDemo}
                isSignedIn={Boolean(initialData.user)}
                isPending={pendingSessionId === session.id}
                onSignup={() => changeSignup(session)}
                canMarkPlayed={
                  !isDemo &&
                  Boolean(initialData.user) &&
                  session.currentUserStatus === "selected" &&
                  !playedSessionIds.has(session.id) &&
                  hasSessionEnded(session)
                }
                hasBeenPlayed={playedSessionIds.has(session.id)}
                onMarkPlayed={() => recordPlayedSession(session.id)}
              />
            ))}
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

function createDemoSessionState(session: ClubSession): DemoSessionState {
  return {
    sessionId: session.id,
    registeredCount: session.registeredCount,
    currentUserStatus: session.currentUserStatus,
  };
}

function hasSessionEnded(session: ClubSession) {
  const sessionStart = new Date(
    session.startsAt.includes("T")
      ? session.startsAt
      : `${session.date}T${session.startsAt}`,
  );
  const sessionEnd = new Date(
    sessionStart.getTime() + session.durationMinutes * 60_000,
  );

  return sessionEnd.getTime() <= Date.now();
}
