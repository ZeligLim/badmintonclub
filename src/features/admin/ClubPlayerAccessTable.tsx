import type { AdminAuditEntry, AdminClubPlayer } from "./data";
import { CommitteeAdminToggle } from "./CommitteeAdminToggle";
import { CommitteeStatusSelect } from "./CommitteeStatusSelect";
import { ProfessionalChoiceToggle } from "./ProfessionalChoiceToggle";

type ClubPlayerAccessTableProps = {
  players: AdminClubPlayer[];
  auditLog: AdminAuditEntry[];
};

export function ClubPlayerAccessTable({
  players,
  auditLog,
}: ClubPlayerAccessTableProps) {
  return (
    <section className="mb-10">
      <h2 className="mb-1 text-base font-semibold">Committee and Professional access</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Set committee status, administrator access and who can select Professional in
        their profile. There must always be at least one administrator.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Player
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Committee
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Admin
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Professional
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              return (
                <tr className="border-t border-border/50 bg-card" key={player.userId}>
                  <td className="px-4 py-2.5">{player.displayName}</td>
                  <td className="px-4 py-2.5">
                    <CommitteeStatusSelect
                      displayName={player.displayName}
                      isCommittee={player.isCommittee}
                      userId={player.userId}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <CommitteeAdminToggle
                      displayName={player.displayName}
                      isCommitteeAdmin={player.isCommitteeAdmin}
                      userId={player.userId}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <ProfessionalChoiceToggle
                      canChooseProfessional={player.canChooseProfessional}
                      displayName={player.displayName}
                      isProfessional={player.playerLevel === "PROFESSIONAL"}
                      userId={player.userId}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="mt-8 mb-2 text-sm font-semibold">Recent administrator changes</h3>
      {auditLog.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No administrator changes have been recorded yet.
        </p>
      ) : (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {auditLog.map((entry) => (
            <li key={entry.id}>
              {entry.actorName}{" "}
              {entry.action === "grant-admin"
                ? "made"
                : "removed administrator access from"}{" "}
              {entry.targetName} ·{" "}
              <time dateTime={entry.createdAt}>
                {new Intl.DateTimeFormat("en-IE", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Europe/London",
                }).format(new Date(entry.createdAt))}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
