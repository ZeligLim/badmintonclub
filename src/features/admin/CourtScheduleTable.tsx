import type { AdminSession } from "./data";
import { SessionAvailabilityToggle } from "./SessionAvailabilityToggle";

export function CourtScheduleTable({ session }: { session: AdminSession }) {
  const selectedPlayers = session.players.filter(
    (p) => p.status === "selected" || p.status === "played",
  );
  const waitlistedPlayers = session.players.filter((p) => p.status === "waitlisted");
  const requestedPlayers = session.players.filter((p) => p.status === "requested");

  const statusBadge =
    session.status === "confirmed"
      ? "bg-primary/10 text-primary"
      : "bg-secondary text-secondary-foreground";
  const isCancelled = session.status === "cancelled";

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
          {session.startsAt.slice(0, 5)} · {session.durationMinutes / 60}h ·{" "}
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
      </div>

      {/* Court schedule table */}
      {isCancelled ? (
        <p className="text-sm text-muted-foreground">
          This session will not take place. Existing sign-ups are retained.
        </p>
      ) : session.courtSchedule.length > 0 ? (
        <div className="overflow-x-auto">
          <div className="flex flex-col gap-3">
            {Array.from(
              session.courtSchedule.reduce((slots, game) => {
                const key = `${game.startAt}|${game.endAt}`;
                if (!slots.has(key)) {
                  slots.set(key, { startAt: game.startAt, endAt: game.endAt });
                }
                return slots;
              }, new Map<string, { startAt: string; endAt: string }>()),
            )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([slotKey, slot]) => (
                <div
                  key={slotKey}
                  className="grid grid-cols-[5rem_1fr] items-start gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-[6rem_1fr]"
                >
                  <div className="whitespace-nowrap tabular-nums text-muted-foreground">
                    <span className="block text-sm font-medium text-foreground">
                      {slot.startAt}
                    </span>
                    <span className="block text-xs">{slot.endAt}</span>
                  </div>
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${session.courtCount}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: session.courtCount }, (_, courtIndex) => {
                      const courtNumber = courtIndex + 1;
                      const game = session.courtSchedule.find(
                        (item) =>
                          item.startAt === slot.startAt &&
                          item.endAt === slot.endAt &&
                          item.courtNumber === courtNumber,
                      );
                      return (
                        <div
                          key={courtNumber}
                          className="min-w-0 rounded-lg bg-background p-2"
                        >
                          <div className="mb-1 text-xs font-semibold text-muted-foreground">
                            Court {courtNumber}
                          </div>
                          <div className="whitespace-pre-line text-xs text-foreground">
                            {game?.players.join("\n") ?? "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </div>
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

      {/* Roster detail */}
      {session.players.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Full roster ({session.players.length})
          </summary>
          <div className="mt-2 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Player
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {session.players
                  .sort(
                    (a, b) =>
                      statusOrder(a.status) - statusOrder(b.status) ||
                      (a.slotNumber ?? 99) - (b.slotNumber ?? 99),
                  )
                  .map((player) => (
                    <tr key={player.userId} className="border-t border-border/50 bg-card">
                      <td className="px-4 py-2">{player.displayName}</td>
                      <td className="px-4 py-2 capitalize text-muted-foreground">
                        {player.status}
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
