import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  createTestAccount,
  deleteTestAccount,
  seedTestAccounts,
} from "./actions";
import { VirtualTimeControl } from "./VirtualTimeControl";

export const instant = false;

type Row = {
  id: string;
  email: string;
  role: string;
  level: string;
  friendCount: number;
};

async function loadRows(): Promise<Row[]> {
  const supabase = createAdminClient();
  const { data: usersData, error: usersError } =
    await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) throw new Error(usersError.message);

  const clubUsers = (usersData?.users ?? []).filter((user) =>
    user.email?.toLowerCase().endsWith("@atu.ie"),
  );
  const ids = clubUsers.map((user) => user.id);

  const [{ data: profiles }, { data: friendRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, player_level, is_committee, is_committee_admin"),
    ids.length
      ? supabase.from("club_friend_list").select("user_id").in("user_id", ids)
      : Promise.resolve({ data: [] }),
  ]);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const friendCountById = new Map<string, number>();
  for (const row of friendRows ?? []) {
    friendCountById.set(row.user_id, (friendCountById.get(row.user_id) ?? 0) + 1);
  }

  return clubUsers.map((user) => {
    const profile = profileById.get(user.id);
    const role = profile?.is_committee_admin
      ? "Committee admin"
      : profile?.is_committee
        ? "Committee member"
        : "Player";
    return {
      email: user.email ?? "",
      friendCount: friendCountById.get(user.id) ?? 0,
      id: user.id,
      level: profile?.player_level ?? "—",
      role,
    };
  });
}

export default async function DevPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const rows = await loadRows();

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">
          Development setup
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Open{" "}
          <a
            href="http://127.0.0.1:54324"
            rel="noreferrer"
            target="_blank"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Mailpit
          </a>{" "}
          in a new tab after requesting a magic link at <code>/sign-in</code>.
        </p>

        <section className="mb-6 rounded-xl bg-muted/40 p-4">
          <VirtualTimeControl />
        </section>

        <form
          action={createTestAccount}
          className="mb-6 grid gap-3 rounded-xl bg-muted/40 p-4 sm:grid-cols-4"
        >
          <input
            className="h-9 rounded-md bg-background px-2.5 text-sm"
            name="email"
            placeholder="email@atu.ie"
            required
            type="email"
          />
          <input
            className="h-9 rounded-md bg-background px-2.5 text-sm"
            name="displayName"
            placeholder="Display name"
            type="text"
          />
          <select
            className="h-9 rounded-md bg-background px-2.5 text-sm"
            name="role"
          >
            <option value="player">Player</option>
            <option value="committee">Committee member</option>
            <option value="committee-admin">Committee admin</option>
          </select>
          <button
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            type="submit"
          >
            Add account
          </button>
        </form>

        <form action={seedTestAccounts} className="mb-6">
          <button
            className="h-9 rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground"
            type="submit"
          >
            Seed 40 test accounts
          </button>
        </form>

        <div className="rounded-xl bg-muted/40 p-4">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-left font-medium">Level</th>
                <th className="px-3 py-2 text-left font-medium">
                  Configure friend to play with
                </th>
                <th className="px-3 py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 font-mono text-xs">{row.email}</td>
                  <td className="px-3 py-2">{row.role}</td>
                  <td className="px-3 py-2">{row.level}</td>
                  <td className="px-3 py-2">
                    {row.friendCount} saved friend
                    {row.friendCount === 1 ? "" : "s"}.
                    Configure by signing in and using the session
                    &ldquo;Play with friends&rdquo; picker.
                  </td>
                  <td className="px-3 py-2">
                    <form action={deleteTestAccount.bind(null, row.id)}>
                      <button
                        className="h-7 rounded-md bg-destructive/10 px-3 text-xs font-medium text-destructive"
                        type="submit"
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Account list is seeded in the local database only. Sign-in is magic-link
          based: request a link at <code>/sign-in</code>, then open it from
          Mailpit at <code>http://127.0.0.1:54324</code>.
        </p>
      </div>
    </main>
  );
}