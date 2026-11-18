"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import { formatTimeOfDay } from "@/lib/format";
import type { ClubSession, TimetableGame } from "../types";

/**
 * Everyone's timetable for one session, read-only.
 *
 * The admin page has the editable version of this grid; members get the same
 * view of who is on which court, without any controls.
 */
export function SessionTimetableDialog({
  session,
  onClose,
}: {
  session: ClubSession;
  onClose: () => void;
}) {
  const games = session.fullTimetable ?? [];
  const rounds = groupByRound(games);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
      <div
        aria-label="Everyone's timetable"
        aria-modal="true"
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-background shadow-xl sm:rounded-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Everyone’s games
            </h2>
            <p className="text-sm text-muted-foreground">
              {session.dayName} {session.date} · {formatTimeOfDay(session.startsAt)}
            </p>
          </div>
          <button
            aria-label="Close timetable"
            className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {rounds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The timetable has not been released yet.
            </p>
          ) : (
            <div className="space-y-4">
              {rounds.map((round) => (
                <section key={round.startAt}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {formatTimeOfDay(round.startAt)}–{formatTimeOfDay(round.endAt)}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {round.games.map((game) => (
                      <div
                        key={`${round.startAt}-${game.courtNumber}`}
                        className="rounded-xl border border-border p-3"
                      >
                        <p className="text-xs font-semibold text-primary">
                          Court {game.courtNumber}
                        </p>
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {game.players.map((player, index) => (
                            <li
                              className={
                                player.noShow
                                  ? "text-muted-foreground line-through"
                                  : player.isYou
                                    ? "font-semibold text-foreground"
                                    : "text-foreground"
                              }
                              key={`${player.displayName}-${index}`}
                            >
                              {player.displayName}
                              {player.isYou && (
                                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-primary no-underline">
                                  you
                                </span>
                              )}
                              {player.noShow && (
                                <span className="ml-1.5 text-[0.65rem] font-medium uppercase tracking-wide">
                                  not coming
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Round = { startAt: string; endAt: string; games: TimetableGame[] };

function groupByRound(games: TimetableGame[]): Round[] {
  const rounds = new Map<string, Round>();
  for (const game of games) {
    const key = game.startAt;
    const round = rounds.get(key) ?? {
      startAt: game.startAt,
      endAt: game.endAt,
      games: [],
    };
    round.games.push(game);
    rounds.set(key, round);
  }

  return [...rounds.values()]
    .map((round) => ({
      ...round,
      games: [...round.games].sort((a, b) => a.courtNumber - b.courtNumber),
    }))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
