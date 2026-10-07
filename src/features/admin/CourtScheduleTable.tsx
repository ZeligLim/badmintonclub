import type { AdminSession } from "./data";

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
          {session.status}
        </span>
      </div>

      {/* Court schedule table */}
      {session.courtSchedule.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  Time
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  Court
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  Players
                </th>
              </tr>
            </thead>
            <tbody>
              {session.courtSchedule.map((game, i) => (
                <tr
                  key={`${game.startAt}-${game.courtNumber}`}
                  className={i % 2 === 0 ? "bg-card" : "bg-muted/20"}
                >
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">
                    {game.startAt}–{game.endAt}
                  </td>
                  <td className="px-4 py-2.5 font-medium">Court {game.courtNumber}</td>
                  <td className="px-4 py-2.5">{game.players.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
          confirmed
        </span>
        {requestedPlayers.length > 0 && (
          <span>
            <span className="font-medium text-foreground">{requestedPlayers.length}</span>{" "}
            awaiting confirmation
          </span>
        )}
        {waitlistedPlayers.length > 0 && (
          <span>
            <span className="font-medium text-foreground">{waitlistedPlayers.length}</span>{" "}
            waitlisted
          </span>
        )}
        {selectedPlayers.length < session.capacity && (
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
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Slot
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
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {player.slotNumber ?? "—"}
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
