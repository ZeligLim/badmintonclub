"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { swapSessionPlayer } from "./session-actions";
import { logError } from "@/lib/log";

type RepairCandidate = {
  userId: string;
  displayName: string;
};

type RepairTimetableFormProps = {
  sessionId: string;
  inTimetable: RepairCandidate[];
  waiting: RepairCandidate[];
};

/**
 * One deliberate repair: take a player out of the saved timetable and put a
 * waiting member in their place. Works after the timetable is released, and the
 * change is audited.
 */
export function RepairTimetableForm({
  sessionId,
  inTimetable,
  waiting,
}: RepairTimetableFormProps) {
  const router = useRouter();
  const [outUserId, setOutUserId] = useState("");
  const [inUserId, setInUserId] = useState("");
  const [reason, setReason] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();

  const canRepair =
    inTimetable.length > 0 && waiting.length > 0 && outUserId && inUserId;

  function submit() {
    if (!canRepair) return;

    setErrorMessage("");
    setNotice("");
    startTransition(async () => {
      try {
        await swapSessionPlayer(sessionId, outUserId, inUserId, reason);
        setNotice("Timetable repaired.");
        setOutUserId("");
        setInUserId("");
        setReason("");
        router.refresh();
      } catch (error) {
        logError("Could not repair the timetable.", error);
        setErrorMessage(
          error instanceof Error ? error.message : "Could not repair the timetable.",
        );
      }
    });
  }

  if (inTimetable.length === 0 || waiting.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">
        Repair this timetable by hand
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Take out</span>
          <select
            className="h-8 rounded-md border border-border bg-white px-2 text-sm"
            onChange={(event) => setOutUserId(event.target.value)}
            value={outUserId}
          >
            <option value="">Choose a player</option>
            {inTimetable.map((player) => (
              <option key={player.userId} value={player.userId}>
                {player.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Put in</span>
          <select
            className="h-8 rounded-md border border-border bg-white px-2 text-sm"
            onChange={(event) => setInUserId(event.target.value)}
            value={inUserId}
          >
            <option value="">Choose a member</option>
            {waiting.map((player) => (
              <option key={player.userId} value={player.userId}>
                {player.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Why (recorded in the audit log)</span>
          <input
            className="h-8 rounded-md border border-border bg-white px-2 text-sm"
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. injured, asked to swap"
            type="text"
            value={reason}
          />
        </label>
        <button
          className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={!canRepair || isPending}
          onClick={submit}
          type="button"
        >
          {isPending ? "Repairing…" : "Swap players"}
        </button>
      </div>
      {notice ? (
        <p className="mt-2 text-xs text-emerald-700" role="status">
          {notice}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
