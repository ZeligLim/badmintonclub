"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Check,
  LoaderCircle,
  LogOut,
  Pencil,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  signOutFromClub,
  updateCommitteeAutoSignupForCurrentUser,
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
  committeeAutoSignup: boolean;
  playerLevel: PlayerLevel;
  canChooseProfessional: boolean;
  onDemoPlayerLevelChange: (playerLevel: "BEGINNER" | "INTERMEDIATE") => void;
};

export function SessionsHeader({
  isDemo,
  displayName,
  isCommittee,
  isCommitteeAdmin,
  committeeAutoSignup: initialCommitteeAutoSignup,
  playerLevel: initialPlayerLevel,
  canChooseProfessional,
  onDemoPlayerLevelChange,
}: SessionsHeaderProps) {
  const router = useRouter();
  const [playerLevel, setPlayerLevel] = useState(initialPlayerLevel);
  const [isUpdatingLevel, startTransition] = useTransition();
  const [levelError, setLevelError] = useState("");
  const [committeeAutoSignup, setCommitteeAutoSignup] = useState(
    initialCommitteeAutoSignup,
  );
  const [isUpdatingAutoSignup, setIsUpdatingAutoSignup] = useState(false);
  const [autoSignupError, setAutoSignupError] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState(displayName ?? "");
  const [nameError, setNameError] = useState("");
  const displayNameRef = useRef<HTMLHeadingElement>(null);
  const fullDisplayNameRef = useRef<HTMLSpanElement>(null);
  const [shouldShortenName, setShouldShortenName] = useState(false);

  useEffect(() => {
    const nameElement = displayNameRef.current;
    const fullNameElement = fullDisplayNameRef.current;
    if (!nameElement || !fullNameElement) {
      return;
    }

    const updateNameLength = () => {
      setShouldShortenName(
        fullNameElement.getBoundingClientRect().width >
          nameElement.getBoundingClientRect().width,
      );
    };

    updateNameLength();
    const observer = new ResizeObserver(updateNameLength);
    observer.observe(nameElement);
    return () => observer.disconnect();
  }, [displayName]);

  function changePlayerLevel(value: string) {
    if (
      value !== "BEGINNER" &&
      value !== "INTERMEDIATE" &&
      value !== "PROFESSIONAL"
    ) {
      return;
    }
    if (value === "PROFESSIONAL" && !canChooseProfessional) {
      return;
    }

    if (isDemo) {
      if (value === "PROFESSIONAL") {
        return;
      }
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

  async function changeCommitteeAutoSignup(nextValue: boolean) {
    if (nextValue === committeeAutoSignup) {
      return;
    }

    setIsUpdatingAutoSignup(true);
    setAutoSignupError("");

    try {
      await updateCommitteeAutoSignupForCurrentUser(nextValue);
      setCommitteeAutoSignup(nextValue);
      router.refresh();
    } catch {
      setAutoSignupError(
        "We couldn’t update automatic signup. Please try again.",
      );
    } finally {
      setIsUpdatingAutoSignup(false);
    }
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
    setIsSavingName(true);
    try {
      await updateDisplayNameForCurrentUser(trimmedName);
      setIsEditingName(false);
      router.refresh();
    } catch {
      setNameError("We couldn’t update your name. Please try again.");
    } finally {
      setIsSavingName(false);
    }
  }

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex w-full min-w-0 items-start gap-3">
        <div className="flex shrink-0 flex-col items-start gap-2">
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
          {isCommittee && (
            <span className="inline-flex h-10 shrink-0 items-center rounded-full bg-primary/10 px-3 text-[0.65rem] font-medium text-primary sm:text-xs">
              Committee
            </span>
          )}
          {isCommitteeAdmin && (
            <span className="inline-flex h-10 shrink-0 items-center rounded-full bg-primary/10 px-3 text-[0.65rem] font-medium text-primary sm:text-xs">
              Admin
            </span>
          )}
        </div>

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
              className="h-10 w-full min-w-0 rounded-md border-0 bg-white px-3 text-sm outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:max-w-44"
              id="demo-player-level"
              onChange={(event) => changePlayerLevel(event.target.value)}
              value={playerLevel}
            >
              <option value="BEGINNER">Your level: Beginner</option>
              <option value="INTERMEDIATE">Your level: Intermediate</option>
            </select>
          </div>
        ) : displayName ? (
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1 sm:gap-2">
              {!isEditingName ? (
                <h1
                  className="relative min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-foreground sm:text-2xl"
                  ref={displayNameRef}
                  title={displayName}
                >
                  <span className="absolute invisible whitespace-nowrap" ref={fullDisplayNameRef}>
                    {displayName}
                  </span>
                  {shouldShortenName
                    ? getCompactDisplayName(displayName)
                    : displayName}
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
                      className="h-10 min-w-0 flex-1 rounded-md bg-background px-3 text-base"
                      disabled={isSavingName}
                      maxLength={80}
                      onChange={(event) => setDraftDisplayName(event.target.value)}
                      value={draftDisplayName}
                    />
                    <button
                      aria-label="Save name"
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/80"
                      disabled={isSavingName}
                      type="submit"
                    >
                      {isSavingName ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <Check aria-hidden="true" className="size-4" />
                      )}
                    </button>
                    <button
                      aria-label="Cancel editing name"
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-white hover:bg-white"
                      disabled={isSavingName}
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
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-white text-sm font-medium text-foreground transition-colors hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              {!isEditingName && (
                <>
                  <label className="sr-only" htmlFor="player-level">
                    Playing level
                  </label>
                  <select
                    className="h-10 min-w-0 flex-1 rounded-md border-0 bg-white px-2 text-xs outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:flex-none sm:px-3 sm:text-sm"
                    disabled={isUpdatingLevel}
                    id="player-level"
                    onChange={(event) => changePlayerLevel(event.target.value)}
                    value={playerLevel}
                  >
                    <option value="BEGINNER">Beginner</option>
                    <option value="INTERMEDIATE">Intermediate</option>
                    {canChooseProfessional && (
                      <option value="PROFESSIONAL">Professional</option>
                    )}
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
                      className="inline-flex size-10 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title="Sign out"
                      type="submit"
                    >
                      <LogOut aria-hidden="true" className="size-4" />
                    </button>
                  </form>
                </>
              )}
            </div>

            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
              {isCommittee && !isEditingName && (
                <div
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-white px-3 text-xs text-foreground"
                >
                  <label
                    className="whitespace-nowrap"
                    htmlFor="committee-auto-signup"
                  >
                    Auto Sign-up
                  </label>
                  <Switch
                    aria-label="Automatically sign me up for sessions"
                    checked={committeeAutoSignup}
                    disabled={isUpdatingAutoSignup}
                    id="committee-auto-signup"
                    onCheckedChange={changeCommitteeAutoSignup}
                    size="sm"
                  />
                </div>
              )}
              {isCommitteeAdmin && (
                <Button
                  className="h-10 rounded-md bg-white px-3 font-normal hover:bg-white"
                  render={<Link href="/admin" />}
                  variant="outline"
                >
                  Manage club
                </Button>
              )}
            </div>
            {autoSignupError && (
              <span className="mt-1 block text-[0.65rem] text-destructive" role="alert">
                {autoSignupError}
              </span>
            )}
            {levelError && (
              <span className="mt-1 block text-[0.65rem] text-destructive" role="alert">
                {levelError}
              </span>
            )}
          </div>
        ) : (
          <Link
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  return `${firstName} ${lastName?.[0] ?? ""}`;
}
