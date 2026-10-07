import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./env";
import type { Database } from "./database.types";

export function createAdminClient() {
  const { url } = getSupabasePublicConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — admin features are unavailable.",
    );
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
}
