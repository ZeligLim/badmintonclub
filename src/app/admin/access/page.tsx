import { redirect } from "next/navigation";
import { AdminNavigation } from "@/features/admin/AdminNavigation";
import { ClubPlayerAccessTable, loadAdminAccountCount, loadAdminAuditLog, loadClubPlayers, requireAdminUser } from "@/features/admin";

export default async function AdminAccessPage() {
  const user = await requireAdminUser(); if (!user) redirect("/sign-in");
  const [players, accountCount, auditLog] = await Promise.all([loadClubPlayers(), loadAdminAccountCount(), loadAdminAuditLog()]);
  return <main className="min-h-screen bg-background px-4 pb-16 pt-6 sm:px-8"><div className="mx-auto w-full max-w-6xl">
    <AdminNavigation current="access" />
    <h1 className="mb-2 text-xl font-semibold">Committee and Professional access</h1><p className="mb-8 text-sm text-muted-foreground">{accountCount} club accounts</p><ClubPlayerAccessTable auditLog={auditLog} players={players}/>
    </div></main>;
}
