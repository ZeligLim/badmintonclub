import "server-only";

import { hasSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function signUp(sessionId: string): Promise<void> {
  await updateSignup(sessionId, "request_session_signup");
}

export async function cancelSignup(sessionId: string): Promise<void> {
  await updateSignup(sessionId, "cancel_session_signup");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(`Could not sign out: ${error.message}`);
  }
}

export async function markSessionPlayed(sessionId: string): Promise<void> {
  validateSessionId(sessionId);
  const supabase = await requireAuthenticatedClient();
  const { error } = await supabase.rpc("check_in_to_session", {
    p_session_id: sessionId,
  });

  if (error) {
    throw new Error(`Could not check in to this session: ${error.message}`);
  }
}

async function updateSignup(
  sessionId: string,
  functionName: "request_session_signup" | "cancel_session_signup",
): Promise<void> {
  validateSessionId(sessionId);
  const supabase = await requireAuthenticatedClient();
  const { error } = await supabase.rpc(functionName, {
    p_session_id: sessionId,
  });

  if (error) {
    throw new Error(
      functionName === "request_session_signup"
        ? `Could not join this session: ${error.message}`
        : `Could not cancel this session: ${error.message}`,
    );
  }
}

async function requireAuthenticatedClient() {
  if (!hasSupabaseConfig()) {
    throw new Error("Session changes are unavailable in local demo mode.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    throw new Error(`Could not verify your sign-in: ${error.message}`);
  }
  if (!data.user) {
    throw new Error("Sign in before changing a session signup.");
  }
  if (!data.user.email || !/^[^@\s]+@atu\.ie$/i.test(data.user.email)) {
    throw new Error("Only @atu.ie email addresses can use club sessions.");
  }

  return supabase;
}

function validateSessionId(sessionId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    throw new Error("That session could not be found.");
  }
}
