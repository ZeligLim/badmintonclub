import { Suspense } from "react";
import { SessionsPage } from "@/features/sessions";

export const instant = false;

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-5 py-16 text-center text-sm text-muted-foreground">
          Loading upcoming sessions…
        </main>
      }
    >
      <SessionsPage />
    </Suspense>
  );
}
