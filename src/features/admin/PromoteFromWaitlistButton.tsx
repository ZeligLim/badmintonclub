"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { promoteFromWaitlist } from "./session-actions";
import { logError } from "@/lib/log";

type PromoteFromWaitlistButtonProps = {
  sessionId: string;
  userId: string;
  displayName: string;
};

export function PromoteFromWaitlistButton({
  sessionId,
  userId,
  displayName,
}: PromoteFromWaitlistButtonProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function promote() {
    setErrorMessage("");
    startTransition(async () => {
      try {
        await promoteFromWaitlist(sessionId, userId);
        router.refresh();
      } catch (error) {
        logError("Could not promote a member from the waitlist.", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not promote a member from the waitlist.",
        );
      }
    });
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        aria-label={`Promote ${displayName} from the waitlist`}
        className="h-7 rounded-md border border-border bg-white px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
        disabled={isPending}
        onClick={promote}
        type="button"
      >
        {isPending ? "Promoting…" : "Promote"}
      </button>
      {errorMessage ? (
        <span className="max-w-48 text-xs text-destructive" role="alert">
          {errorMessage}
        </span>
      ) : null}
    </span>
  );
}
