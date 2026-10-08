"use client";

import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  signOutFromClub,
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

  return (
    <header className="flex items-center justify-between">
      <Link
        aria-label="ATU Galway Badminton Club home"
        className="flex items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href="/"
      >
        <Image
          alt="ATU Galway Badminton Club"
          className="size-14 rounded-full object-cover sm:size-16"
          height={64}
          priority
          src="/logo.png"
          width={64}
        />
      </Link>

      {isDemo ? (
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            Local demo
          </span>
          <label className="sr-only" htmlFor="demo-player-level">
            Demo playing level
          </label>
          <select
            className="max-w-44 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            id="demo-player-level"
            onChange={(event) => changePlayerLevel(event.target.value)}
            value={playerLevel}
          >
            <option value="BEGINNER">Your level: Beginner</option>
            <option value="INTERMEDIATE">Your level: Intermediate</option>
            <option disabled value="PROFESSIONAL">
              Professional · invite-only
            </option>
          </select>
        </div>
      ) : displayName ? (
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-col items-end gap-1">
            <span className="max-w-56 truncate text-sm text-muted-foreground">
              {displayName}
            </span>
            <div className="flex items-center gap-2">
              {isCommittee && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Committee
                </span>
              )}
              <label className="sr-only" htmlFor="player-level">
                Playing level
              </label>
              <select
                className="max-w-36 rounded-md border border-border bg-background px-2 py-1 text-xs"
                disabled={isUpdatingLevel}
                id="player-level"
                onChange={(event) => changePlayerLevel(event.target.value)}
                value={playerLevel}
              >
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option disabled value="PROFESSIONAL">
                  Professional · invite-only
                </option>
              </select>
            </div>
            {levelError && (
              <span className="text-xs text-destructive" role="alert">
                {levelError}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {isCommitteeAdmin && (
              <Link
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
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
                className="rounded-sm px-2 py-1 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : (
        <Link
          className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="https://badmintonclub.vercel.app/sign-in"
        >
          Sign in <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      )}
    </header>
  );
}
