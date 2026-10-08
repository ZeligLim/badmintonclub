import type { AdminClubPlayer } from "./data";
import { updateClubCommitteeStatus } from "./player-actions";
import { ProfessionalChoiceToggle } from "./ProfessionalChoiceToggle";

type ClubPlayerAccessTableProps = {
  players: AdminClubPlayer[];
};

export function ClubPlayerAccessTable({ players }: ClubPlayerAccessTableProps) {
  return (
    <section className="mb-10">
      <h2 className="mb-1 text-base font-semibold">Committee and Professional access</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Set committee status and choose who can select Professional in their profile.
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
                Professional
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const formId = `committee-status-${player.userId}`;

              return (
                <tr className="border-t border-border/50 bg-card" key={player.userId}>
                  <td className="px-4 py-2.5">{player.displayName}</td>
                  <td className="px-4 py-2.5">
                    <form action={updateClubCommitteeStatus} id={formId}>
                      <input name="user_id" type="hidden" value={player.userId} />
                      <select
                        aria-label={`${player.displayName} committee status`}
                        className="rounded-md border border-border bg-background px-2 py-1"
                        defaultValue={player.isCommittee ? "true" : "false"}
                        form={formId}
                        name="is_committee"
                      >
                        <option value="false">Member</option>
                        <option value="true">Committee</option>
                      </select>
                      <button
                        className="ml-2 rounded-md bg-primary px-3 py-1.5 text-primary-foreground"
                        type="submit"
                      >
                        Save
                      </button>
                    </form>
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
    </section>
  );
}
