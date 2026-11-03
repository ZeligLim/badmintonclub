"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setTestAccountRole } from "./actions";

type RoleSelectProps = {
  userId: string;
  initialRole: "player" | "committee" | "committee-admin";
};

export function RoleSelect({ userId, initialRole }: RoleSelectProps) {
  const router = useRouter();
  const [role, setRole] = useState(initialRole);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function changeRole(nextRole: string) {
    if (
      nextRole !== "player" &&
      nextRole !== "committee" &&
      nextRole !== "committee-admin"
    ) {
      return;
    }
    if (nextRole === role) return;

    const previousRole = role;
    setRole(nextRole as RoleSelectProps["initialRole"]);
    setErrorMessage("");
    startTransition(async () => {
      try {
        await setTestAccountRole(userId, nextRole);
        router.refresh();
      } catch (error) {
        setRole(previousRole);
        setErrorMessage(
          error instanceof Error ? error.message : "Could not update role.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {isPending ? (
        <span className="inline-flex h-7 items-center text-xs text-muted-foreground" role="status">
          Saving…
        </span>
      ) : (
        <select
          aria-label="Test account role"
          className="h-7 rounded-md bg-white px-2 py-0 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => changeRole(event.target.value)}
          value={role}
        >
          <option value="player">Player</option>
          <option value="committee">Committee member</option>
          <option value="committee-admin">Committee admin</option>
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