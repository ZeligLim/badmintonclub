import { redirect } from "next/navigation";
import { AdminNavigation } from "@/features/admin/AdminNavigation";
import { AdminHeader } from "@/features/admin/AdminHeader";
import { SessionTabs } from "@/features/admin/SessionTabs";
import {
  CourtScheduleTable,
  loadAdminData,
  requireAdminUser,
} from "@/features/admin";

export const instant = false;

export default async function AdminPage() {
  const user = await requireAdminUser();
  if (!user) redirect("/sign-in");

  const sessions = await loadAdminData();

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-6 sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <AdminHeader email={user.email} />

        <AdminNavigation current="sessions" />

        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming sessions found.</p>
        ) : (
          <SessionTabs sessions={sessions}>
            {sessions.map((session) => (
              <CourtScheduleTable key={session.id} session={session} />
            ))}
          </SessionTabs>
        )}
      </div>
    </main>
  );
}
