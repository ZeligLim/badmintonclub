import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SessionsPage } from "@/features/sessions";

export default function DevPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-5 py-16 text-center text-sm text-muted-foreground">
          Loading demo sessions…
        </main>
      }
    >
      <SessionsPage mode="demo" />
    </Suspense>
  );
}
