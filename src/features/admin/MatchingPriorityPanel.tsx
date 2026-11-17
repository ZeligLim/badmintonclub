"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";

import { saveMatchingPriority } from "@/features/admin/settings-actions";
import type { MatchingPriorityKey } from "@/features/sessions/court-schedule";

const LABELS: Record<MatchingPriorityKey, string> = {
  committee: "Committee requests",
  level: "Playing level",
  friends: "Friend pairs",
};

export function MatchingPriorityPanel({
  initialPriority,
}: {
  initialPriority: MatchingPriorityKey[];
}) {
  const [priority, setPriority] = useState(initialPriority);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= priority.length) return;
    const next = [...priority];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setPriority(next);
    setSaved(false);
    setError("");
  }

  function save() {
    setError("");
    startTransition(async () => {
      try {
        await saveMatchingPriority(priority);
        setSaved(true);
      } catch {
        setError("We couldn’t save the matching order. Please try again.");
      }
    });
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold">Matching priority</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Fair play always comes first. After that, the order below decides how a
        timetable is built.
      </p>

      <ol className="mt-3 space-y-2">
        {priority.map((key, index) => (
          <li
            className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3"
            key={key}
          >
            <span className="w-5 text-xs text-muted-foreground">{index + 1}.</span>
            <span className="min-w-0 flex-1 text-sm">{LABELS[key]}</span>
            <button
              aria-label={`Move ${LABELS[key]} up`}
              className="flex size-9 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted disabled:opacity-40"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              type="button"
            >
              <ArrowUp aria-hidden="true" className="size-4" />
            </button>
            <button
              aria-label={`Move ${LABELS[key]} down`}
              className="flex size-9 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted disabled:opacity-40"
              disabled={index === priority.length - 1}
              onClick={() => move(index, 1)}
              type="button"
            >
              <ArrowDown aria-hidden="true" className="size-4" />
            </button>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-xs text-muted-foreground">
        Applies to the next timetable generated. Timetables already released are
        never rearranged.
      </p>

      {priority[0] === "friends" && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          With friends first, a strong player can end up isolated with three
          weaker ones. Keep playing level above friend pairs unless you want that.
        </p>
      )}

      {error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          disabled={isPending}
          onClick={save}
          type="button"
        >
          {isPending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          Save order
        </button>
        {saved && <span className="text-xs text-muted-foreground">Saved.</span>}
      </div>
    </section>
  );
}
