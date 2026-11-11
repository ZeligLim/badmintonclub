"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateCommitteeAdminStatus } from "./player-actions";
import { logError } from "@/lib/log";

type CommitteeAdminToggleProps = {
  userId: string;
  displayName: string;
  isCommitteeAdmin: boolean;
};

export function CommitteeAdminToggle({
  userId,
  displayName,
  isCommitteeAdmin: initialIsCommitteeAdmin,
}: CommitteeAdminToggleProps) {
  const router = useRouter();
  const [isCommitteeAdmin, setIsCommitteeAdmin] = useState(
    initialIsCommitteeAdmin,
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function changeAdminStatus(value: string) {
    if (value !== "true" && value !== "false") {
      return;
    }

    const nextIsAdmin = value === "true";
    if (nextIsAdmin === isCommitteeAdmin) {
      return;
    }

    setErrorMessage("");
    startTransition(async () => {
      try {
        await updateCommitteeAdminStatus(userId, nextIsAdmin);
        setIsCommitteeAdmin(nextIsAdmin);
        router.refresh();
      } catch (error) {
        logError("Could not update administrator access.", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not update administrator access.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {isPending ? (
        <span
          className="inline-flex h-7 items-center text-xs text-muted-foreground"
          role="status"
        >
          Saving…
        </span>
      ) : (
        <select
          aria-label={`${displayName} administrator access`}
          className="h-7 rounded-md border-0 bg-card px-2 py-0 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => changeAdminStatus(event.target.value)}
          value={isCommitteeAdmin ? "true" : "false"}
        >
          <option value="false">No</option>
          <option value="true">Admin</option>
        </select>
      )}
      {errorMessage ? (
        <p className="max-w-48 text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
