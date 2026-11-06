"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { logError } from "@/lib/log";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("Unhandled page error.", error, { digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Badminton Club
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong loading this page
      </h1>
      <p className="text-sm text-muted-foreground">
        The error has been logged. Try again — if it keeps happening, let the
        committee know what you were doing.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          Reference: <code>{error.digest}</code>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to sessions
        </Link>
      </div>
    </main>
  );
}
