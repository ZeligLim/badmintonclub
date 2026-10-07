export type SupabasePublicConfig = {
  url: string;
  key: string;
};

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

  return { url, key };
}
