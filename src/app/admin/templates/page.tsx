import { redirect } from "next/navigation";
import { AdminNavigation } from "@/features/admin/AdminNavigation";
import { loadSessionTemplates, requireAdminUser, SessionTemplateManager } from "@/features/admin";

export default async function AdminTemplatesPage() {
  const user = await requireAdminUser(); if (!user) redirect("/sign-in");
  const templates = await loadSessionTemplates();
  return <main className="min-h-screen bg-background px-4 pb-16 pt-6 sm:px-8"><div className="mx-auto w-full max-w-6xl">
    <AdminNavigation current="templates" />
    <h1 className="mb-8 text-xl font-semibold">Session templates</h1><SessionTemplateManager templates={templates}/>
    </div></main>;
}
