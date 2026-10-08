"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateSessionAvailability } from "./session-actions";

type SessionAvailabilityToggleProps = {
  sessionId: string;
  isHappening: boolean;
  isConfirmed: boolean;
};

export function SessionAvailabilityToggle({
  sessionId,
  isHappening: initialIsHappening,
  isConfirmed,
}: SessionAvailabilityToggleProps) {
  const router = useRouter();
  const [isHappening, setIsHappening] = useState(initialIsHappening);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggleAvailability() {
    if (
      isHappening &&
      !window.confirm(
        `Mark this session as not happening?${isConfirmed ? " Its confirmed places will be retained." : ""}`,
      )
    ) {
      return;
    }

    setErrorMessage("");
    startTransition(async () => {
      try {
        await updateSessionAvailability(sessionId, !isHappening);
        setIsHappening((current) => !current);
        router.refresh();
      } catch (error) {
        console.error("Could not update session availability.", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not update session availability.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        aria-checked={isHappening}
        aria-label={isHappening ? "Mark session not happening" : "Reopen session"}
        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border px-3 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        onClick={toggleAvailability}
        role="switch"
        type="button"
      >
        <span
          aria-hidden="true"
          className={`relative h-5 w-9 rounded-full transition-colors ${
            isHappening ? "bg-primary" : "bg-muted-foreground"
          }`}
        >
          <span
            className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${
              isHappening ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </span>
        {isPending
          ? "Updating…"
          : isHappening
            ? "Happening"
            : "Not happening"}
      </button>
      {errorMessage && (
        <p className="max-w-xs text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
