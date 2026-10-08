"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ArrowRight, Check, Pencil, X } from "lucide-react";
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
            {!isEditingName ? (
              <div className="flex min-w-0 items-center gap-2">
                <button
                  className="group inline-flex min-w-0 max-w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-base font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-lg"
                  onClick={() => {
                    setDraftDisplayName(displayName);
                    setNameError("");
                    setIsEditingName(true);
                  }}
                  type="button"
                >
                  <span className="max-w-[9rem] truncate sm:max-w-[14rem]">
                    {displayName}
                  </span>
                  <Pencil
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
                  />
                </button>
              </div>
            ) : (
              <form
                className="flex min-w-0 max-w-[14rem] flex-col gap-1 sm:max-w-[18rem]"
                onSubmit={saveDisplayName}
              >
                <div className="flex items-center gap-1">
                  <input
                    autoComplete="name"
                    className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-base"
                    maxLength={80}
                    onChange={(event) => setDraftDisplayName(event.target.value)}
                    value={draftDisplayName}
                  />
                  <button
                    aria-label="Save name"
                    className="inline-flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground"
                    type="submit"
                  >
                    <Check aria-hidden="true" className="size-3.5" />
                  </button>
                  <button
                    aria-label="Cancel editing name"
                    className="inline-flex size-10 items-center justify-center rounded-md border border-border bg-background"
                    onClick={() => {
                      setIsEditingName(false);
                      setNameError("");
                      setDraftDisplayName(displayName);
                    }}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </div>
                {nameError && (
                  <span className="text-[0.65rem] text-destructive" role="alert">
                    {nameError}
                  </span>
                )}
              </form>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-2">
              {isCommittee && (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium text-primary sm:text-xs">
                  Committee
                </span>
              )}
              <label className="sr-only" htmlFor="player-level">
                Playing level
              </label>
              <select
                className="h-10 min-w-[8.5rem] rounded-md border border-border bg-background px-3 text-sm"
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

      {isDemo || !displayName ? null : (
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-4">
          {isCommitteeAdmin && (
            <Link
              className="inline-flex h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
              href="/admin"
            >
              Manage club
            </Link>
          )}
          <form
            action={signOutFromClub}
            onSubmit={(event) => {
              if (!window.confirm("Are you sure you want to sign out?")) {
                event.preventDefault();
              }
            }}
          >
            <button
              className="inline-flex h-10 items-center rounded-sm px-2 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </header>
  );
}
