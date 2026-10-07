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
    </>
  );
}
