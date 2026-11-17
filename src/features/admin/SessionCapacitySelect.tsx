"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateSessionCapacity } from "./session-actions";

const CAPACITIES = Array.from({ length: 16 }, (_, index) => (index + 1) * 4);

export function SessionCapacitySelect({
  sessionId,
  capacity,
  disabled,
}: {
  sessionId: string;
  capacity: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      Capacity
      <select
        aria-label="Capacity for this session"
        className="h-10 rounded-lg border border-border bg-card py-2 pl-3 pr-9 text-foreground"
        value={capacity}
        disabled={disabled || pending}
        onChange={(event) => {
          const value = Number(event.target.value);
          setError("");
          startTransition(async () => {
            try {
              await updateSessionCapacity(sessionId, value);
              router.refresh();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Could not update capacity.");
            }
          });
        }}
      >
        {CAPACITIES.map((option) => (
          <option key={option} value={option}>
            {option} places
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}
