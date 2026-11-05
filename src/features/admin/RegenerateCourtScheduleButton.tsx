"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { regenerateSessionCourtSchedule } from "./session-actions";
import { logError } from "@/lib/log";

export function RegenerateCourtScheduleButton({ sessionId }: { sessionId: string }) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  function regenerate() {
    setErrorMessage("");
    startTransition(async () => {
      try {
        await regenerateSessionCourtSchedule(sessionId);
      } catch (error) {
        logError("Could not regenerate the court schedule.", error);
        setErrorMessage(
          error instanceof Error ? error.message : "Could not regenerate the court schedule.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={regenerate}
        aria-label={isPending ? "Regenerating court schedule" : "Regenerate court schedule"}
      >
        <RefreshCw aria-hidden="true" className={isPending ? "animate-spin" : undefined} />
        {isPending ? "Regenerating…" : "Regenerate schedule"}
      </Button>
      {errorMessage ? (
        <p className="max-w-xs text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
