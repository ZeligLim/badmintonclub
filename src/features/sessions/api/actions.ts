import "server-only";

import { hasSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { sendBookingConfirmationEmailBestEffort } from "./booking-confirmation-email";
import type { FriendCandidate } from "../types";

export async function finalizeDueSessions(): Promise<number> {
  const supabase = await requireAuthenticatedClient();
  const { data, error } = await supabase.rpc("finalize_due_sessions");

  if (error) {
    throw new Error(`Could not finalize due sessions: ${error.message}`);
  }

  return data;
}

export async function signUp(
  sessionId: string,
  friendIds: string[],
): Promise<void> {
  validateFriendIds(friendIds);
  await updateSignup(sessionId, "request_session_signup", friendIds);
}

export async function updateSessionFriendPreferences(
  sessionId: string,
  friendIds: string[],
): Promise<void> {
  validateFriendIds(friendIds);
  validateSessionId(sessionId);

  const supabase = await requireAuthenticatedClient();
  const { error } = await supabase.rpc("update_session_friend_preferences", {
    p_session_id: sessionId,
    p_friend_ids: friendIds,
  });

  if (error) {
    console.error("Could not save session friend preferences.", {
      code: error.code,
    });
    throw new Error("Could not save your friend choices.");
  }
}

export async function searchClubMembers(
  query: string,
): Promise<FriendCandidate[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2 || normalizedQuery.length > 64) {
    throw new Error("Search using at least two characters.");
  }

  const supabase = await requireAuthenticatedClient();
  const { data, error } = await supabase.rpc("find_club_members", {
    p_query: normalizedQuery,
  });

  if (error) {
    console.error("Could not search club members.", { code: error.code });
    throw new Error("Could not search club members.");
  }

  return data.map((friend) => {
    if (
      friend.player_level !== "BEGINNER" &&
      friend.player_level !== "INTERMEDIATE" &&
      friend.player_level !== "PROFESSIONAL"
    ) {
      throw new Error("A club member has an unsupported player level.");
    }

    return {
      userId: friend.user_id,
      displayName: friend.display_name,
      studentId: friend.student_id,
      playerLevel: friend.player_level,
      isSelected: false,
    };
  });
}

export async function addClubFriend(friendId: string): Promise<void> {
  validateFriendId(friendId);
  const supabase = await requireAuthenticatedClient();
  const { error } = await supabase.rpc("add_my_friend", {
    p_friend_user_id: friendId,
  });

  if (error) {
    console.error("Could not add a club friend.", { code: error.code });
    throw new Error("Could not add this friend.");
  }
}

export async function removeClubFriend(friendId: string): Promise<void> {
  validateFriendId(friendId);
  const supabase = await requireAuthenticatedClient();
  const { error } = await supabase.rpc("remove_my_friend", {
    p_friend_user_id: friendId,
  });

  if (error) {
    console.error("Could not remove a club friend.", { code: error.code });
    throw new Error("Could not remove this friend.");
  }
}

export async function updatePlayerLevel(
  playerLevel: "BEGINNER" | "INTERMEDIATE" | "PROFESSIONAL",
): Promise<void> {
  const supabase = await requireAuthenticatedClient();
  const { error } = await supabase.rpc("update_my_player_level", {
    p_player_level: playerLevel,
  });

  if (error) {
    throw new Error(`Could not update your player level: ${error.message}`);
  }
}

export async function updateCommitteeAutoSignup(enabled: boolean): Promise<void> {
  const supabase = await requireAuthenticatedClient();
  const { error } = await supabase.rpc("set_my_committee_auto_signup", {
    p_enabled: enabled,
  });

  if (error) {
    throw new Error(`Could not update automatic signup: ${error.message}`);
  }
}

export async function updateDisplayName(
  displayName: string,
): Promise<void> {
  const trimmedName = displayName.trim();
  if (!trimmedName || trimmedName.length > 80) {
    throw new Error("Enter a valid display name between 1 and 80 characters.");
  }

  const supabase = await requireAuthenticatedClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) {
    throw new Error(`Could not verify your sign-in: ${authError.message}`);
  }
  if (!authData.user) {
    throw new Error("Sign in before updating your name.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: trimmedName })
    .eq("id", authData.user.id);

  if (error) {
    throw new Error(`Could not update your name: ${error.message}`);
  }
}

export async function joinConfirmedSession(sessionId: string): Promise<void> {
  validateSessionId(sessionId);
  const supabase = await requireAuthenticatedClient();
  const { error } = await supabase.rpc("join_confirmed_session", {
    p_session_id: sessionId,
  });

  if (error) {
    throw new Error(`Could not join this session: ${error.message}`);
  }

  await sendBookingConfirmationEmailBestEffort(supabase, sessionId);
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
  friendIds: string[] = [],
): Promise<void> {
  validateSessionId(sessionId);
  const supabase = await requireAuthenticatedClient();
  const { error } =
    functionName === "request_session_signup"
      ? await supabase.rpc(functionName, {
          p_session_id: sessionId,
          p_friend_ids: friendIds,
        })
      : await supabase.rpc(functionName, { p_session_id: sessionId });

  if (error) {
    console.error("Could not update session signup.", {
      operation: functionName,
      code: error.code,
    });
    throw new Error(
      functionName === "request_session_signup"
        ? "Could not join this session."
        : "Could not cancel this session.",
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

function validateFriendIds(friendIds: string[]): void {
  const hasInvalidId = friendIds.some(
    (friendId) =>
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        friendId,
      ),
  );
  if (friendIds.length > 3 || hasInvalidId) {
    throw new Error("Select up to three valid club members.");
  }
}

function validateFriendId(friendId: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      friendId,
    )
  ) {
    throw new Error("Choose a valid club member.");
  }
}
