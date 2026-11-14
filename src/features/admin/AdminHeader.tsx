import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AdminHeader({ email }: { email?: string | null }) {
  return (
    <header className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <Button
        className="h-10 rounded-lg border-primary bg-primary px-4 text-primary-foreground hover:bg-primary/90"
        nativeButton={false}
        render={<Link href="/" />}
        variant="default"
      >
        <ArrowLeft aria-hidden="true" />
        Sessions
      </Button>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Admin — Court Schedule
        </h1>
        {email ? <p className="mt-1 text-base text-muted-foreground">{email}</p> : null}
      </div>
    </header>
  );
}
