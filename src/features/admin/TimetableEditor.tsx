"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, LogOut, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminCourtPlayer, AdminPlayer, AdminSession } from "./data";
import {
  placeTimetablePlayer,
  removeTimetablePlayer,
  swapSessionPlayer,
  swapTimetablePlayers,
} from "./session-actions";

type Selected = AdminCourtPlayer & { courtNumber: number; startAt: string };

type PendingAction =
  | { kind: "swap"; player: Selected; other: Selected }
  | { kind: "place"; player: Selected; courtNumber: number; startAt: string }
  | { kind: "remove"; player: Selected }
  | { kind: "replace"; player: Selected; incoming: AdminPlayer };

export function TimetableEditor({ session }: { session: AdminSession }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Selected | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const waiting = useMemo(
    () => session.players.filter((player) => player.status === "waitlisted"),
    [session.players],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelected(null);
        setPending(null);
        setReason("");
        setError(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const slots = useMemo(() => {
    const bySlot = new Map<string, { startAt: string; endAt: string }>();
    for (const game of session.courtSchedule) {
      bySlot.set(`${game.startAt}|${game.endAt}`, {
        startAt: game.startAt,
        endAt: game.endAt,
      });
    }
    return [...bySlot.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, slot]) => ({ key, ...slot }));
  }, [session.courtSchedule]);

  const gameFor = (startAt: string, courtNumber: number) =>
    session.courtSchedule.find(
      (game) => game.startAt === startAt && game.courtNumber === courtNumber,
    );

  function selectPlayer(player: AdminCourtPlayer, courtNumber: number, startAt: string) {
    setError(null);
    setPending(null);

    if (!selected) {
      setSelected({ ...player, courtNumber, startAt });
      return;
    }

    if (selected.id === player.id) {
      // A player can appear in several games; tapping another of their seats
      // moves the selection there instead of clearing it.
      setSelected(
        selected.courtNumber === courtNumber && selected.startAt === startAt
          ? null
          : { ...player, courtNumber, startAt },
      );
      return;
    }

    setPending({ kind: "swap", player: selected, other: { ...player, courtNumber, startAt } });
    setSelected(null);
  }

  function chooseEmptySeat(courtNumber: number, startAt: string) {
    if (!selected) return;
    setError(null);
    setPending({ kind: "place", player: selected, courtNumber, startAt });
    setSelected(null);
  }

  function chooseWaiting(incoming: AdminPlayer) {
    if (!selected) return;
    setError(null);
    setPending({ kind: "replace", player: selected, incoming });
    setSelected(null);
  }

  function confirm() {
    if (!pending) return;
    setError(null);

    startSaving(async () => {
      try {
        if (pending.kind === "swap") {
          await swapTimetablePlayers({
            sessionId: session.id,
            playerAId: pending.player.id,
            courtA: pending.player.courtNumber,
            startA: pending.player.startAt,
            playerBId: pending.other.id,
            courtB: pending.other.courtNumber,
            startB: pending.other.startAt,
            reason,
          });
        } else if (pending.kind === "place") {
          await placeTimetablePlayer({
            sessionId: session.id,
            playerId: pending.player.id,
            courtNumber: pending.courtNumber,
            startAt: pending.startAt,
            fromCourtNumber: pending.player.courtNumber,
            fromStartAt: pending.player.startAt,
            reason,
          });
        } else if (pending.kind === "remove") {
          await removeTimetablePlayer({
            sessionId: session.id,
            playerId: pending.player.id,
            reason,
          });
        } else {
          await swapSessionPlayer(
            session.id,
            pending.player.id,
            pending.incoming.userId,
            reason,
          );
        }
        setSelected(null);
        setPending(null);
        setReason("");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save that change.");
      }
    });
  }

  return (
    <div className={cn("space-y-3", (selected || pending) && "pb-56 sm:pb-44")}>
      <p
        className={cn(
          "rounded-md border px-3 py-2 text-sm",
          session.timetableLocked
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : "border-border bg-muted/50 text-muted-foreground",
        )}
      >
        {session.timetableLocked
          ? "This timetable has already been released to players. Changes are saved immediately and recorded in the audit log."
          : "Tap a player, then tap another player to swap just those two seats, or an empty seat to move them there. A player can play several rounds, but never two courts at once."}
      </p>

      <p aria-live="polite" className="sr-only">
        {selected ? `Selected ${selected.displayName}.` : "No player selected."}
      </p>

      {slots.map((slot) => (
        <div key={slot.key} className="rounded-xl bg-muted/40 p-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold tabular-nums">
              {slot.startAt}–{slot.endAt}
            </span>
            <span className="text-xs text-muted-foreground">
              {session.courtCount} {session.courtCount === 1 ? "court" : "courts"}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: session.courtCount }, (_, index) => {
              const courtNumber = index + 1;
              const game = gameFor(slot.startAt, courtNumber);
              const players = game?.players ?? [];
              const emptySeats = Math.max(0, 4 - players.length);

              return (
                <div key={courtNumber} className="rounded-lg bg-background p-2">
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Court {courtNumber}
                    </span>
                    <span className="text-[0.65rem] text-muted-foreground">
                      {players.length}/4
                    </span>
                  </div>

                  <ul className="grid gap-1.5">
                    {players.map((player) => {
                      const isSelected =
                        selected?.id === player.id &&
                        selected.courtNumber === courtNumber &&
                        selected.startAt === slot.startAt;
                      return (
                        <li key={`${slot.key}-${courtNumber}-${player.id}`}>
                          <button
                            type="button"
                            onClick={() => selectPlayer(player, courtNumber, slot.startAt)}
                            aria-pressed={isSelected}
                            className={cn(
                              "min-h-11 w-full truncate rounded-md border px-3 text-left text-sm transition-colors",
                              isSelected
                                ? "border-primary bg-primary/10 font-semibold text-primary"
                                : "border-border bg-background hover:bg-muted",
                            )}
                          >
                            {player.displayName}
                          </button>
                        </li>
                      );
                    })}

                    {Array.from({ length: emptySeats }, (_, index) => (
                      <li key={`${slot.key}-${courtNumber}-empty-${index}`}>
                        <button
                          type="button"
                          onClick={() => chooseEmptySeat(courtNumber, slot.startAt)}
                          disabled={!selected}
                          className={cn(
                            "min-h-11 w-full rounded-md border border-dashed px-3 text-left text-sm",
                            selected
                              ? "border-primary/50 text-primary hover:bg-primary/5"
                              : "border-border text-muted-foreground/60",
                          )}
                        >
                          {selected ? `Place ${selected.displayName} here` : "Empty seat"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {(selected || pending) && (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-3xl rounded-t-xl border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur sm:rounded-t-2xl">
          {selected ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-semibold">{selected.displayName}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · court {selected.courtNumber} · {selected.startAt}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setPending({ kind: "remove", player: selected })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-sm text-destructive"
              >
                <LogOut className="size-4" aria-hidden />
                Take out
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm"
              >
                <X className="size-4" aria-hidden />
                <span className="sr-only">Clear selection</span>
              </button>
              {waiting.length > 0 && (
                <div className="basis-full">
                  <p className="mb-1 text-xs text-muted-foreground">Replace with a waiting member</p>
                  <div className="flex flex-wrap gap-1.5">
                    {waiting.slice(0, 6).map((player) => (
                      <button
                        key={player.userId}
                        type="button"
                        onClick={() => chooseWaiting(player)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs"
                      >
                        <UserPlus className="size-3.5" aria-hidden />
                        {player.displayName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {pending ? (
            <div className="mt-2 space-y-2 border-t pt-2">
              <p className="text-sm font-medium">{describePending(pending)}</p>
              {pending.kind === "swap" || pending.kind === "place" ? (
                <p className="text-xs text-muted-foreground">
                  Only these seats change. Every other game in the session stays as it is.
                </p>
              ) : null}
              <label className="block text-xs text-muted-foreground">
                Reason (optional)
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-sm text-foreground"
                  placeholder="e.g. knee injury, wanted to play together"
                  maxLength={200}
                />
              </label>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirm}
                  disabled={isSaving}
                  className="min-h-11 flex-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {isSaving ? "Saving…" : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPending(null);
                    setReason("");
                    setError(null);
                  }}
                  className="min-h-11 rounded-md border px-4 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {error && !pending ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describePending(pending: PendingAction): string {
  switch (pending.kind) {
    case "swap":
      return pending.player.startAt === pending.other.startAt
        ? `Swap ${pending.player.displayName} (court ${pending.player.courtNumber}) and ${pending.other.displayName} (court ${pending.other.courtNumber}) at ${pending.player.startAt}?`
        : `Swap ${pending.player.displayName} (court ${pending.player.courtNumber} at ${pending.player.startAt}) with ${pending.other.displayName} (court ${pending.other.courtNumber} at ${pending.other.startAt})?`;
    case "place":
      return `Move ${pending.player.displayName} to court ${pending.courtNumber} at ${pending.startAt}?`;
    case "remove":
      return `Take ${pending.player.displayName} out of every game?`;
    case "replace":
      return `Replace ${pending.player.displayName} with ${pending.incoming.displayName}?`;
    default: {
      const exhaustive: never = pending;
      return exhaustive;
    }
  }
}

export function TimetableEditorEmptyHint() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <ArrowLeftRight className="size-4" aria-hidden />
      Tap a player to move them.
    </p>
  );
}
