export type SupabasePublicConfig = {
  url: string;
  key: string;
};

const LOCAL_SUPABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * The Supabase URL must be the project origin only. Anything else (a path, a
 * query string) is silently appended to by supabase-js, which sends requests to
 * the wrong gateway route — for example a `/storage/v1/s3` suffix makes the
 * S3-compatible storage API answer with an XML `AccessDenied` error instead
 * of a PostgREST response.
 */
function parseSupabaseUrl(url: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `Invalid NEXT_PUBLIC_SUPABASE_URL: "${url}" is not a valid URL.`,
    );
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  if (path) {
    throw new Error(
      `Invalid NEXT_PUBLIC_SUPABASE_URL: "${url}" must be the project origin without a path (found "${path}"). Use the origin only, e.g. http://127.0.0.1:54321 for local Supabase.`,
    );
  }

  if (
    process.env.NODE_ENV === "development" &&
    !LOCAL_SUPABASE_HOSTS.has(parsed.hostname)
  ) {
    throw new Error(
      `Invalid NEXT_PUBLIC_SUPABASE_URL: "${url}" is not a local Supabase instance. Development must run against local Supabase (http://127.0.0.1:54321).`,
    );
  }

  return parsed;
}

export function hasSupabaseConfig(): boolean {
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasKey = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  if (hasUrl !== hasKey) {
    throw new Error(
      "Supabase configuration is incomplete. Set NEXT_PUBLIC_SUPABASE_URL and a public Supabase key.",
    );
  }

  return hasUrl;
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and a public Supabase key.",
    );
  }

  return { url: parseSupabaseUrl(url).origin, key };
}
