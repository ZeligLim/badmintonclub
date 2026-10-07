import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { signOutFromClub } from "@/features/sessions";

type SessionsHeaderProps = {
  isDemo: boolean;
  displayName: string | null;
};

export function SessionsHeader({ isDemo, displayName }: SessionsHeaderProps) {
  return (
    <header className="flex items-center justify-between">
      <Link
        aria-label="ATU Galway Badminton Club home"
        className="flex items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href="/"
      >
        <Image
          alt="ATU Galway Badminton Club"
          className="size-14 rounded-full object-cover sm:size-16"
          height={64}
          priority
          src="/logo.png"
          width={64}
        />
      </Link>

      {isDemo ? (
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-primary">
          <span className="size-1.5 rounded-full bg-primary" />
          Local demo
        </span>
      ) : displayName ? (
        <div className="flex items-center gap-3">
          <span className="max-w-56 truncate text-sm text-muted-foreground">
            {displayName}
          </span>
          <form action={signOutFromClub}>
            <button
              className="rounded-sm px-2 py-1 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <Link
          className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/sign-in"
        >
          Sign in <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      )}
    </header>
  );
}
