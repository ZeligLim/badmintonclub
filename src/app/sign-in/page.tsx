import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SessionsSignIn } from "@/features/sessions";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function SignInPage() {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (
    error &&
    error.name !== "AuthSessionMissingError" &&
    error.status !== 401
  ) {
    throw new Error(`Could not check your sign-in status: ${error.message}`);
  }

  if (data.user?.email && /^[^@\s]+@atu\.ie$/i.test(data.user.email)) {
    redirect("/");
  }

  return (
    <main className="min-h-screen px-5 pb-12 pt-3 sm:px-8 sm:pt-5">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex items-center justify-between">
          <Link
            aria-label="ATU Galway Badminton Club home"
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <Link
            className="text-sm font-medium text-foreground transition-colors hover:text-primary"
            href="/"
          >
            Back to sessions
          </Link>
        </header>
        <div className="mx-auto max-w-md">
          <SessionsSignIn />
        </div>
      </div>
    </main>
  );
}
