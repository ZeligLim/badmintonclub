"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateClubCommitteeStatus } from "./player-actions";

type CommitteeStatusSelectProps = {
  userId: string;
  displayName: string;
  isCommittee: boolean;
};

export function CommitteeStatusSelect({
  userId,
  displayName,
  isCommittee: initialIsCommittee,
}: CommitteeStatusSelectProps) {
  const router = useRouter();
  const [isCommittee, setIsCommittee] = useState(initialIsCommittee);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function changeCommitteeStatus(value: string) {
    if (value !== "true" && value !== "false") {
      return;
    }

    const nextIsCommittee = value === "true";
    if (nextIsCommittee === isCommittee) {
      return;
    }

    setErrorMessage("");
    startTransition(async () => {
      try {
        await updateClubCommitteeStatus(userId, nextIsCommittee);
        setIsCommittee(nextIsCommittee);
        router.refresh();
      } catch (error) {
        console.error("Could not update committee status.", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not update committee status.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={`${displayName} committee status`}
        className="rounded-md bg-background px-2 py-1"
        disabled={isPending}
        onChange={(event) => changeCommitteeStatus(event.target.value)}
        value={isCommittee ? "true" : "false"}
      >
        <option value="false">Member</option>
        <option value="true">Committee</option>
      </select>
      {isPending ? (
        <span className="text-xs text-muted-foreground" role="status">
          Saving…
        </span>
      ) : null}
      {errorMessage ? (
        <p className="max-w-48 text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
