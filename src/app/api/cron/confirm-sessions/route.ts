import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export async function GET(request: Request): Promise<Response> {
  const expectedSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expectedSecret) {
    return Response.json({ error: "Cron authentication is not configured." }, { status: 500 });
  }
  if (!isAuthorized(authorization, expectedSecret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return Response.json({ error: "Session finalization is not configured." }, { status: 500 });
  }

  const supabase = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.rpc("finalize_due_sessions");
  if (error) {
    return Response.json(
      { error: `Could not finalize due sessions: ${error.message}` },
      { status: 500 },
    );
  }

  return Response.json({ finalized: data });
}

function isAuthorized(
  authorization: string | null,
  expectedSecret: string,
): boolean {
  const expectedHeader = Buffer.from(`Bearer ${expectedSecret}`);
  const providedHeader = Buffer.from(authorization ?? "");

  return (
    expectedHeader.length === providedHeader.length &&
    timingSafeEqual(expectedHeader, providedHeader)
  );
}
