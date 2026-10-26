import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  addDevFriend,
  createTestAccount,
  deleteTestAccount,
  randomSessionSignups,
  removeDevFriend,
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

type FriendPair = {
  friendEmail: string;
  friendId: string;
  userEmail: string;
  userId: string;
};

async function loadFriendPairs(): Promise<FriendPair[]> {
  const supabase = createAdminClient();
  const { data: userRows, error: userError } = await supabase.rpc(
    "list_dev_test_users",
  );
  if (userError) throw new Error(userError.message);

  const { data: pairRows, error: pairError } =
    await supabase.from("club_friend_list").select("user_id, friend_user_id");
  if (pairError) throw new Error(pairError.message);

  const userById = new Map(
    (userRows ?? []).map((user: { email: string; id: string }) => [
      user.id,
      user.email,
    ]),
  );
  return (pairRows ?? [])
    .map((pair: { friend_user_id: string; user_id: string }) => ({
      friendEmail: userById.get(pair.friend_user_id) ?? pair.friend_user_id,
      friendId: pair.friend_user_id,
      userEmail: userById.get(pair.user_id) ?? pair.user_id,
      userId: pair.user_id,
    }))
    .filter((pair) => pair.userEmail && pair.friendEmail);
}

async function loadRows(): Promise<Row[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("list_dev_test_users");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: {
    email: string;
    friend_count: number | null;
    id: string;
    is_committee: boolean | null;
    is_committee_admin: boolean | null;
    player_level: string | null;
  }) => ({
    email: row.email,
    friendCount: Number(row.friend_count ?? 0),
    id: row.id,
    level: row.player_level ?? "—",
    role: row.is_committee_admin
      ? "Committee admin"
      : row.is_committee
        ? "Committee member"
        : "Player",
  }));
}

export default async function DevPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const rows = await loadRows();
  const friendPairs = await loadFriendPairs();

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

        <VirtualTimeControl />

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

        <form
          action={seedTestAccounts}
          className="mb-6 flex flex-wrap items-end gap-3 rounded-xl bg-muted/40 p-4"
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            Accounts to seed
            <input
              className="h-9 rounded-md bg-background px-2.5 text-sm"
              defaultValue="40"
              max="200"
              min="1"
              name="seedCount"
              type="number"
            />
          </label>
          <button
            className="h-9 rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground"
            type="submit"
          >
            Seed accounts
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
                    <form
                      action={addDevFriend}
                      className="flex min-w-48 items-center gap-2"
                    >
                      <input
                        name="userEmail"
                        type="hidden"
                        value={row.email}
                      />
                      <input
                        className="h-8 min-w-0 rounded-md bg-background px-2 text-xs"
                        name="friendEmail"
                        placeholder="friend@atu.ie"
                        type="email"
                      />
                      <button
                        className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
                        type="submit"
                      >
                        Save
                      </button>
                    </form>
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

        <form
          action={randomSessionSignups}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-xl bg-muted/40 p-4"
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            Players per open session
            <input
              className="h-9 rounded-md bg-background px-2.5 text-sm"
              defaultValue="8"
              max="100"
              min="1"
              name="signupCount"
              type="number"
            />
          </label>
          <button
            className="h-9 rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground"
            type="submit"
          >
            Randomly sign up test players
          </button>
          <p className="w-full text-xs text-muted-foreground">
            Randomly selects local @atu.ie test accounts for every open session,
            using the current virtual time.
          </p>
        </form>
      </div>
    </main>
  );
}