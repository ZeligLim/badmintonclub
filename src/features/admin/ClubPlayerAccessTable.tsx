import type { AdminClubPlayer } from "./data";
import { updateClubPlayerAccess } from "./player-actions";

type ClubPlayerAccessTableProps = {
  players: AdminClubPlayer[];
};

export function ClubPlayerAccessTable({ players }: ClubPlayerAccessTableProps) {
  return (
    <section className="mb-10">
      <h2 className="mb-1 text-base font-semibold">Player levels and committee</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Beginner and Intermediate are available to members. Professional is
        invite-only and can only be assigned here by an administrator.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Player
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Playing level
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Committee
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const formId = `player-access-${player.userId}`;

              return (
                <tr className="border-t border-border/50 bg-card" key={player.userId}>
                  <td className="px-4 py-2.5">{player.displayName}</td>
                  <td className="px-4 py-2.5">
                    <select
                      aria-label={`${player.displayName} playing level`}
                      className="rounded-md border border-border bg-background px-2 py-1"
                      defaultValue={player.playerLevel}
                      form={formId}
                      name="player_level"
                    >
                      <option value="BEGINNER">Beginner</option>
                      <option value="INTERMEDIATE">Intermediate</option>
                      <option value="PROFESSIONAL">Professional · invite-only</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
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
                  </td>
                  <td className="px-4 py-2.5">
                    <form action={updateClubPlayerAccess} id={formId}>
                      <input name="user_id" type="hidden" value={player.userId} />
                      <button
                        className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground"
                        type="submit"
                      >
                        Save
                      </button>
                    </form>
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
