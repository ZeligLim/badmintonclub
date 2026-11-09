import { isSessionTimetableLocked } from "@/features/sessions/court-schedule";
import { formatDuration, formatFee, formatTimeOfDay } from "@/lib/format";
import type { AdminSession } from "./data";
import { SessionAvailabilityToggle } from "./SessionAvailabilityToggle";
import { RegenerateCourtScheduleButton } from "./RegenerateCourtScheduleButton";
import { PromoteFromWaitlistButton } from "./PromoteFromWaitlistButton";
import { PaymentStatusSelect } from "./PaymentStatusSelect";
import { TimetableEditor } from "./TimetableEditor";

export function CourtScheduleTable({ session }: { session: AdminSession }) {
  const selectedPlayers = session.players.filter(
    (p) => p.status === "selected" || p.status === "played",
  );
  const waitlistedPlayers = session.players.filter((p) => p.status === "waitlisted");
  const requestedPlayers = session.players.filter((p) => p.status === "requested");

  const paidCount = selectedPlayers.filter(
    (player) => player.paymentStatus === "paid",
  ).length;

  // How many games each member appears in for this session. With a full
  // roster this makes an uneven timetable (someone playing three rounds while
  // someone else plays one) visible at a glance.
  const gamesByPlayer = new Map<string, number>();
  for (const game of session.courtSchedule) {
    for (const player of game.players) {
      gamesByPlayer.set(player.id, (gamesByPlayer.get(player.id) ?? 0) + 1);
    }
  }

  const statusBadge =
    session.status === "confirmed"
      ? "bg-primary/10 text-primary"
      : "bg-secondary text-secondary-foreground";
  const isCancelled = session.status === "cancelled";
  const timetableLocked = isSessionTimetableLocked({
    eventDate: session.date,
    startsAt: session.startsAt,
  });

  return (
    <section>
      {/* Session header */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold">
          {session.dayName},{" "}
          {new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }).format(new Date(`${session.date}T12:00:00Z`))}
        </h2>
        <span className="text-sm text-muted-foreground">
          {formatTimeOfDay(session.startsAt)} · {formatDuration(session.durationMinutes)} ·{" "}
          {session.courtCount} courts · capacity {session.capacity}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold capitalize ${statusBadge}`}
        >
          {isCancelled ? "Not happening" : session.status}
        </span>
        {session.availabilityCanChange && (
          <SessionAvailabilityToggle
            sessionId={session.id}
            isHappening={!isCancelled}
            isConfirmed={session.status === "confirmed"}
          />
        )}
        {!isCancelled && !timetableLocked && selectedPlayers.length > 0 && (
          <RegenerateCourtScheduleButton sessionId={session.id} />
        )}
      </div>

      {session.timetableNeedsSaving && !isCancelled ? (
        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This schedule exists only on this page. Save it with
          {" \u201cregenerate\u201d"} before the release time so members see
          the same courts.
        </p>
      ) : null}

      {/* Court schedule table */}
      {isCancelled ? (
        <p className="text-sm text-muted-foreground">
          This session will not take place. Existing sign-ups are retained.
        </p>
      ) : session.courtSchedule.length > 0 ? (
        <TimetableEditor session={session} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {session.status === "confirmed"
            ? "No players confirmed yet."
            : "Players will be assigned after confirmation."}
        </p>
      )}
      {/* Player summary */}
      <div className="mt-4 flex flex-wrap gap-6 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{selectedPlayers.length}</span>{" "}
          {isCancelled ? "previously confirmed" : "confirmed"}
        </span>
        {requestedPlayers.length > 0 && (
          <span>
            <span className="font-medium text-foreground">{requestedPlayers.length}</span>{" "}
            {isCancelled ? "signup requests retained" : "awaiting confirmation"}
          </span>
        )}
        {waitlistedPlayers.length > 0 && (
          <span>
            <span className="font-medium text-foreground">{waitlistedPlayers.length}</span>{" "}
            {isCancelled ? "waitlisted (retained)" : "waitlisted"}
          </span>
        )}
        {!isCancelled && selectedPlayers.length < session.capacity && (
          <span>
            <span className="font-medium text-foreground">
              {session.capacity - selectedPlayers.length}
            </span>{" "}
            spots available
          </span>
        )}
      </div>

      {session.feeCents > 0 && selectedPlayers.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {formatFee(session.feeCents * paidCount)}
          </span>{" "}
          collected of {formatFee(session.feeCents * selectedPlayers.length)}{" "}
          expected
          {selectedPlayers.length - paidCount > 0
            ? ` · ${selectedPlayers.length - paidCount} outstanding`
            : " · all settled"}
        </p>
      )}

      {/* Roster detail */}
      {session.players.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Full roster ({session.players.length})
          </summary>
          <div className="relative mt-2 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Player
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Games
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Payment
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...session.players]
                  .sort(
                    (a, b) =>
                      statusOrder(a.status) - statusOrder(b.status) ||
                      (a.slotNumber ?? 99) - (b.slotNumber ?? 99),
                  )
                  .map((player) => (
                    <tr key={player.userId} className="border-t border-border/50 bg-card">
                      <td className="px-4 py-2">{player.displayName}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {gamesByPlayer.get(player.userId) ?? 0}
                      </td>
                      <td className="px-4 py-2 capitalize text-muted-foreground">
                        {player.status === "waitlisted" ||
                        player.status === "requested" ? (
                          <span className="inline-flex items-center gap-2">
                            {player.status}
                            {selectedPlayers.length < session.capacity ? (
                              <PromoteFromWaitlistButton
                                displayName={player.displayName}
                                sessionId={session.id}
                                userId={player.userId}
                              />
                            ) : null}
                          </span>
                        ) : (
                          player.status
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {session.feeCents > 0 &&
                        (player.status === "selected" || player.status === "played") ? (
                          <PaymentStatusSelect
                            displayName={player.displayName}
                            paymentStatus={player.paymentStatus}
                            sessionId={session.id}
                            userId={player.userId}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function statusOrder(status: string) {
  return { selected: 0, played: 1, requested: 2, waitlisted: 3 }[status] ?? 4;
}
