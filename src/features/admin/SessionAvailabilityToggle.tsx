"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
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

  function toggleAvailability(nextIsHappening: boolean) {
    if (nextIsHappening === isHappening) {
      return;
    }

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
        await updateSessionAvailability(sessionId, nextIsHappening);
        setIsHappening(nextIsHappening);
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
      <div className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-card px-3">
        <label
          className="cursor-pointer whitespace-nowrap text-xs font-medium"
          htmlFor={`session-happening-${sessionId}`}
        >
          {isPending
            ? "Updating…"
            : isHappening
              ? "Happening"
              : "Not happening"}
        </label>
        <Switch
          checked={isHappening}
          disabled={isPending}
          id={`session-happening-${sessionId}`}
          onCheckedChange={toggleAvailability}
        />
      </div>
      {errorMessage ? (
        <p className="max-w-xs text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
