import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ClubPlayerAccessTable,
  CourtScheduleTable,
  loadAdminData,
  loadClubPlayers,
  requireAdminUser,
} from "@/features/admin";

export const instant = false;

export default async function AdminPage() {
  const user = await requireAdminUser();
  if (!user) redirect("/sign-in");

  const [sessions, players] = await Promise.all([
    loadAdminData(),
    loadClubPlayers(),
  ]);

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Button
            className="h-10 rounded-md bg-white px-3 hover:bg-white"
            render={<Link href="/" />}
            variant="outline"
          >
            <ArrowLeft aria-hidden="true" />
            Sessions
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Admin — Court Schedule</h1>
            <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
          </div>
        </header>

        <ClubPlayerAccessTable players={players} />

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
