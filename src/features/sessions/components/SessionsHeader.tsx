"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ArrowRight, Check, LogOut, Pencil, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  signOutFromClub,
  updateDisplayNameForCurrentUser,
  updatePlayerLevelForCurrentUser,
  type PlayerLevel,
} from "@/features/sessions";
import { useRouter } from "next/navigation";

type SessionsHeaderProps = {
  isDemo: boolean;
  displayName: string | null;
  isCommittee: boolean;
  isCommitteeAdmin: boolean;
  playerLevel: PlayerLevel;
  onDemoPlayerLevelChange: (playerLevel: "BEGINNER" | "INTERMEDIATE") => void;
};

export function SessionsHeader({
  isDemo,
  displayName,
  isCommittee,
  isCommitteeAdmin,
  playerLevel: initialPlayerLevel,
  onDemoPlayerLevelChange,
}: SessionsHeaderProps) {
  const router = useRouter();
  const [playerLevel, setPlayerLevel] = useState(initialPlayerLevel);
  const [isUpdatingLevel, startTransition] = useTransition();
  const [levelError, setLevelError] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState(displayName ?? "");
  const [nameError, setNameError] = useState("");
  const compactDisplayName = getCompactDisplayName(displayName ?? "");

  function changePlayerLevel(value: string) {
    if (value !== "BEGINNER" && value !== "INTERMEDIATE") {
      return;
    }

    if (isDemo) {
      setPlayerLevel(value);
      onDemoPlayerLevelChange(value);
      return;
    }

    setLevelError("");
    startTransition(async () => {
      try {
        await updatePlayerLevelForCurrentUser(value);
        setPlayerLevel(value);
        router.refresh();
      } catch {
        setLevelError("We couldn’t update your playing level. Please try again.");
      }
    });
  }

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = draftDisplayName.trim();

    if (!trimmedName) {
      setNameError("Enter a display name.");
      return;
    }
    if (trimmedName.length > 80) {
      setNameError("Display name must be 80 characters or fewer.");
      return;
    }

    setNameError("");
    try {
      await updateDisplayNameForCurrentUser(trimmedName);
      setIsEditingName(false);
      router.refresh();
    } catch {
      setNameError("We couldn’t update your name. Please try again.");
    }
  }

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          aria-label="ATU Galway Badminton Club home"
          className="flex shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/"
        >
          <Image
            alt="ATU Galway Badminton Club"
            className="size-16 rounded-full object-cover sm:size-20"
            height={64}
            priority
            src="/logo.png"
            width={64}
          />
        </Link>

        {isDemo ? (
          <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              Local demo
            </span>
            <label className="sr-only" htmlFor="demo-player-level">
              Demo playing level
            </label>
            <select
              className="h-10 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm sm:w-auto sm:max-w-44"
              id="demo-player-level"
              onChange={(event) => changePlayerLevel(event.target.value)}
              value={playerLevel}
            >
              <option value="BEGINNER">Your level: Beginner</option>
              <option value="INTERMEDIATE">Your level: Intermediate</option>
              <option disabled value="PROFESSIONAL">
                Professional
              </option>
            </select>
          </div>
        ) : displayName ? (
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1 sm:gap-2">
              {!isEditingName ? (
                <h1
                  className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-foreground sm:text-2xl"
                  title={displayName}
                >
                  <span className="sm:hidden">{compactDisplayName}</span>
                  <span className="hidden sm:inline">{displayName}</span>
                </h1>
              ) : (
                <form
                  className="flex min-w-0 flex-1 flex-col gap-1"
                  onSubmit={saveDisplayName}
                >
                  <div className="flex items-center gap-1">
                    <input
                      autoComplete="name"
                      aria-label="Display name"
                      className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-base"
                      maxLength={80}
                      onChange={(event) => setDraftDisplayName(event.target.value)}
                      value={draftDisplayName}
                    />
                    <button
                      aria-label="Save name"
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
                      type="submit"
                    >
                      <Check aria-hidden="true" className="size-4" />
                    </button>
                    <button
                      aria-label="Cancel editing name"
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background"
                      onClick={() => {
                        setIsEditingName(false);
                        setNameError("");
                        setDraftDisplayName(displayName);
                      }}
                      type="button"
                    >
                      <X aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                  {nameError && (
                    <span className="text-xs text-destructive" role="alert">
                      {nameError}
                    </span>
                  )}
                </form>
              )}
              {!isEditingName && (
                <button
                  aria-label="Edit name"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setDraftDisplayName(displayName);
                    setNameError("");
                    setIsEditingName(true);
                  }}
                  type="button"
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </button>
              )}
              <label className="sr-only" htmlFor="player-level">
                Playing level
              </label>
              <select
                className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs sm:w-auto sm:flex-none sm:px-3 sm:text-sm"
                disabled={isUpdatingLevel}
                id="player-level"
                onChange={(event) => changePlayerLevel(event.target.value)}
                value={playerLevel}
              >
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option disabled value="PROFESSIONAL">
                  Professional
                </option>
              </select>
              <form
                action={signOutFromClub}
                className="shrink-0"
                onSubmit={(event) => {
                  if (!window.confirm("Are you sure you want to sign out?")) {
                    event.preventDefault();
                  }
                }}
              >
                <button
                  aria-label="Sign out"
                  className="inline-flex size-10 items-center justify-center rounded-md border border-border bg-background text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Sign out"
                  type="submit"
                >
                  <LogOut aria-hidden="true" className="size-4" />
                </button>
              </form>
            </div>

            <div className="mt-2 flex min-w-0 items-center gap-2">
              {isCommittee && (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium text-primary sm:text-xs">
                  Committee
                </span>
              )}
              {isCommitteeAdmin && (
                <Link
                  className="inline-flex h-10 shrink-0 items-center rounded-md px-2 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
                  href="/admin"
                >
                  Manage club
                </Link>
              )}
            </div>
            {levelError && (
              <span className="mt-1 block text-[0.65rem] text-destructive" role="alert">
                {levelError}
              </span>
            )}
          </div>
        ) : (
          <Link
            className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="https://badmintonclub.vercel.app/sign-in"
          >
            Sign in <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </div>

    </header>
  );
}

function getCompactDisplayName(name: string): string {
  const nameParts = name.trim().split(/\s+/).filter(Boolean);
  if (nameParts.length < 2) {
    return name;
  }

  const firstName = nameParts[0];
  const lastName = nameParts.at(-1);
  return `${firstName} ${lastName?.[0]}.`;
}
