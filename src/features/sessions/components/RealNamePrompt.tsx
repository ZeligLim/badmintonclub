"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { updateDisplayNameForCurrentUser } from "@/features/sessions";
import { logError } from "@/lib/log";
import { isStudentNumberDisplayName } from "../display-name";

const SNOOZE_PREFIX = "badminton:real-name-prompt:";

type RealNamePromptProps = {
  userId: string;
  displayName: string | null;
};

/**
 * A member's profile starts with their email local part, which for students is
 * their student number. Ask them for a real name the first time they reach the
 * dashboard, because that name is what the rest of the club sees on a court.
 */
export function RealNamePrompt({ userId, displayName }: RealNamePromptProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isStudentNumberDisplayName(displayName) || hasSnoozed(userId)) {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    previousOverflow.current = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    if (!dialog.open) {
      dialog.showModal();
    }

    return () => {
      restoreOverflow();
    };
  }, [displayName, userId]);

  function restoreOverflow() {
    if (previousOverflow.current === null) {
      return;
    }
    document.documentElement.style.overflow = previousOverflow.current;
    previousOverflow.current = null;
  }

  function snooze() {
    rememberSnooze(userId);
    dialogRef.current?.close();
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Enter the name you want other members to see.");
      return;
    }
    if (trimmedName.length > 80) {
      setError("Keep your name to 80 characters or fewer.");
      return;
    }
    if (isStudentNumberDisplayName(trimmedName)) {
      setError("Use your real name, not your student number.");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      await updateDisplayNameForCurrentUser(trimmedName);
      dialogRef.current?.close();
      router.refresh();
    } catch (cause) {
      logError("Could not save a real name.", cause);
      setError("We couldn’t save your name. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <dialog
      aria-describedby="real-name-description"
      aria-labelledby="real-name-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(92vw,26rem)] overflow-y-auto rounded-2xl border border-border bg-background p-5 text-foreground shadow-2xl backdrop:bg-black/50"
      onCancel={(event) => {
        event.preventDefault();
        snooze();
      }}
      onClose={restoreOverflow}
      ref={dialogRef}
    >
      <form className="space-y-4" onSubmit={saveName}>
        <div>
          <h2 className="text-lg font-semibold tracking-tight" id="real-name-title">
            What’s your name?
          </h2>
          <p
            className="mt-1 text-sm leading-6 text-muted-foreground"
            id="real-name-description"
          >
            Other members see your student number on court lists. Add your real
            name so they know who they’re playing with.
          </p>
        </div>

        <label className="block text-sm font-medium">
          Your name
          <input
            autoComplete="name"
            className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
            disabled={isSaving}
            maxLength={80}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
            placeholder="First and last name"
            required
            value={name}
          />
        </label>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="min-h-11 rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            disabled={isSaving}
            onClick={snooze}
            type="button"
          >
            Later
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save name"
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function snoozeKey(userId: string): string {
  return `${SNOOZE_PREFIX}${userId}:snoozed`;
}

function hasSnoozed(userId: string): boolean {
  try {
    return window.sessionStorage.getItem(snoozeKey(userId)) === "1";
  } catch {
    // Storage can be unavailable in private browsing; the prompt still works.
    return false;
  }
}

function rememberSnooze(userId: string): void {
  try {
    window.sessionStorage.setItem(snoozeKey(userId), "1");
  } catch {
    // Ignore a storage refusal. The member may see the prompt again.
  }
}
