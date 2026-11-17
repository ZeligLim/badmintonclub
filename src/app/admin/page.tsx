import { redirect } from "next/navigation";
import { AdminNavigation } from "@/features/admin/AdminNavigation";
import { AdminHeader } from "@/features/admin/AdminHeader";
import { MatchingPriorityPanel } from "@/features/admin/MatchingPriorityPanel";
import { SessionTabs } from "@/features/admin/SessionTabs";
import {
  CourtScheduleTable,
  loadAdminData,
  requireAdminUser,
} from "@/features/admin";
import { readMatchingPriority } from "@/features/sessions/api/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export const instant = false;

export default async function AdminPage() {
  const user = await requireAdminUser();
  if (!user) redirect("/sign-in");

  const sessions = await loadAdminData();
  const matchingPriority = await readMatchingPriority(createAdminClient());

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-6 sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <AdminHeader email={user.email} />

        <AdminNavigation current="sessions" />

        <MatchingPriorityPanel initialPriority={matchingPriority} />

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
