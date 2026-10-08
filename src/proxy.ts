import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig, hasSupabaseConfig } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

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
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    const cookiesToForward = response.cookies.getAll();
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.searchParams.delete("code");
    response = NextResponse.redirect(callbackUrl);
    cookiesToForward.forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  const { error } = await supabase.auth.getUser();
  const isExpiredSession =
    error?.code === "refresh_token_not_found" ||
    error?.code === "refresh_token_already_used" ||
    error?.code === "session_expired";
  if (
    error &&
    error.name !== "AuthSessionMissingError" &&
    !isExpiredSession
  ) {
    throw new Error(`Could not refresh your sign-in: ${error.message}`);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
