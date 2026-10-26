import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SessionsPage } from "@/features/sessions";
import { CourtScheduleTable } from "@/features/admin/CourtScheduleTable";
import { createDemoAdminSessions } from "@/features/sessions/demo-data";

export const instant = false;

export default async function DevPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  await connection();
  const adminSessions = createDemoAdminSessions();

  return (
    <>
      <Suspense
        fallback={
          <main className="min-h-screen px-5 py-16 text-center text-sm text-muted-foreground">
            Loading demo sessions…
          </main>
        }
      >
        <SessionsPage mode="demo" />
      </Suspense>

      <section className="border-t border-border px-4 pb-16 pt-10 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="mb-6 text-lg font-semibold tracking-tight">
            Court Schedule <span className="ml-2 text-sm font-normal text-muted-foreground">(demo)</span>
          </h2>
          <div className="space-y-10">
            {adminSessions.map((session) => (
              <CourtScheduleTable key={session.id} session={session} />
            ))}
          </div>
        </div>
      </section>


      <section className="border-t border-border px-4 pb-16 pt-10 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="mb-6 text-lg font-semibold tracking-tight">
            Test accounts <span className="ml-2 text-sm font-normal text-muted-foreground">(local only)</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Level</th>
                  <th className="px-3 py-2 font-medium">How to use</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-3 py-2 font-mono text-xs">testcommittee@atu.ie</td>
                  <td className="px-3 py-2">Committee admin</td>
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2">Sign in at <code>/sign-in</code>, then open the link in Mailpit.</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-3 py-2 font-mono text-xs">committee@atu.ie</td>
                  <td className="px-3 py-2">Committee member</td>
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2">Sign in at <code>/sign-in</code>, then open the link in Mailpit.</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-3 py-2 font-mono text-xs">alice@atu.ie</td>
                  <td className="px-3 py-2">Player</td>
                  <td className="px-3 py-2">Beginner</td>
                  <td className="px-3 py-2">Sign in at <code>/sign-in</code>, then open the link in Mailpit.</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono text-xs">bob@atu.ie</td>
                  <td className="px-3 py-2">Player</td>
                  <td className="px-3 py-2">Intermediate</td>
                  <td className="px-3 py-2">Sign in at <code>/sign-in</code>, then open the link in Mailpit.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Account list is seeded in the local database only. Sign-in is magic-link
            based: request a link at <code>/sign-in</code>, then open it from Mailpit
            at <code>http://127.0.0.1:54324</code>.
          </p>
        </div>
      </section>

    </>
  );
}
