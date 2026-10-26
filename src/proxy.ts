import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig, hasSupabaseConfig } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

function unreachableSupabaseMessage(url: string): string {
  return `Could not refresh your sign-in: Supabase is not reachable at ${url}. Start the local Supabase stack (Docker must be running, then \`npm run db:start\`) and restart \`npm run dev\`.`;
}

function isNetworkFailure(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    /fetch failed|failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(message) ||
    /Fetch|Network/i.test(name)
  );
}

export async function proxy(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return NextResponse.next({ request });
  }

  const { url, key } = getSupabasePublicConfig();
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    try {
      await supabase.auth.exchangeCodeForSession(code);
    } catch (error) {
      if (isNetworkFailure(error)) {
        throw new Error(unreachableSupabaseMessage(url));
      }
      throw new Error(
        `Could not refresh your sign-in: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const cookiesToForward = response.cookies.getAll();
    const headersToForward = ["cache-control", "expires", "pragma"].map(
      (name) => [name, response.headers.get(name)] as const,
    );
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.searchParams.delete("code");
    response = NextResponse.redirect(callbackUrl);
    cookiesToForward.forEach((cookie) => response.cookies.set(cookie));
    for (const [name, value] of headersToForward) {
      if (value) {
        response.headers.set(name, value);
      }
    }
    return response;
  }

  let claimsResult: Awaited<ReturnType<typeof supabase.auth.getClaims>>;
  try {
    claimsResult = await supabase.auth.getClaims();
  } catch (error) {
    if (isNetworkFailure(error)) {
      throw new Error(unreachableSupabaseMessage(url));
    }
    throw new Error(
      `Could not refresh your sign-in: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const { error } = claimsResult;
  if (error) {
    if (isNetworkFailure(error)) {
      throw new Error(unreachableSupabaseMessage(url));
    }
    const isExpiredSession =
      error.code === "refresh_token_not_found" ||
      error.code === "refresh_token_already_used" ||
      error.code === "session_expired";
    if (error.name !== "AuthSessionMissingError" && !isExpiredSession) {
      throw new Error(`Could not refresh your sign-in: ${error.message}`);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};