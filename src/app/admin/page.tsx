import { redirect } from "next/navigation";
import Link from "next/link";
import { loadAdminData, requireAdminUser } from "@/features/admin/data";
import { CourtScheduleTable } from "@/features/admin/CourtScheduleTable";

export const instant = false;

export default async function AdminPage() {
  const user = await requireAdminUser();
  if (!user) redirect("/sign-in");

  const sessions = await loadAdminData();

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Admin — Court Schedule</h1>
            <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Link
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            href="/"
          >
            ← Back to sessions
          </Link>
        </header>

        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming sessions found.</p>
        ) : (
          <div className="space-y-10">
            {sessions.map((session) => (
              <CourtScheduleTable key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
