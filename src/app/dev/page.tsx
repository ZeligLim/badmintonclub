import { notFound } from "next/navigation";

export const instant = false;

const TEST_ACCOUNTS = [
  { email: "testcommittee@atu.ie", role: "Committee admin", level: "—" },
  { email: "committee@atu.ie", role: "Committee member", level: "—" },
  { email: "alice@atu.ie", role: "Player", level: "Beginner" },
  { email: "bob@atu.ie", role: "Player", level: "Intermediate" },
];

export default async function DevPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">
          Development setup
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">
          This page is development-only. It lists accounts seeded in the local database.
        </p>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">Test accounts</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Level</th>
                  <th className="px-3 py-2 font-medium">How to sign in</th>
                </tr>
              </thead>
              <tbody>
                {TEST_ACCOUNTS.map((account) => (
                  <tr className="border-b border-border/50" key={account.email}>
                    <td className="px-3 py-2 font-mono text-xs">
                      {account.email}
                    </td>
                    <td className="px-3 py-2">{account.role}</td>
                    <td className="px-3 py-2">{account.level}</td>
                    <td className="px-3 py-2">
                      Request a magic link at <code>/sign-in</code>, then open
                      it from Mailpit at{" "}
                      <code>http://127.0.0.1:54324</code>.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Account list is seeded in the local database only. Sign-in is
            magic-link based: request a link at <code>/sign-in</code>, then open
            it from Mailpit at <code>http://127.0.0.1:54324</code>.
          </p>
        </section>
      </div>
    </main>
  );
}