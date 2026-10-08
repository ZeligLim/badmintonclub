"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  finalizeDueSessions as finalizeDue,
  findFriendByStudentId as findFriendByStudentIdAction,
  markSessionPlayed as markPlayed,
  cancelSignup,
  signOut,
  signUp,
  updateDisplayName,
  updateSessionFriendPreferences as updateSessionFriendPreferencesAction,
  updatePlayerLevel,
  joinConfirmedSession as joinConfirmed,
} from "./actions";
import { loadDashboardData } from "./dashboard";
import type { DashboardData } from "../types";

export async function getDashboardData(): Promise<DashboardData> {
  return loadDashboardData();
}

export async function finalizeDueSessions(): Promise<number> {
  return finalizeDue();
}

export async function findFriendByStudentId(studentId: string) {
  return findFriendByStudentIdAction(studentId);
}

export async function signUpForSession(
  sessionId: string,
  friendIds: string[] = [],
): Promise<void> {
  await signUp(sessionId, friendIds);
}

export async function saveSessionFriendPreferences(
  sessionId: string,
  friendIds: string[],
): Promise<void> {
  await updateSessionFriendPreferencesAction(sessionId, friendIds);
}

export async function updatePlayerLevelForCurrentUser(
  playerLevel: "BEGINNER" | "INTERMEDIATE",
): Promise<void> {
  await updatePlayerLevel(playerLevel);
}

export async function updateDisplayNameForCurrentUser(
  displayName: string,
): Promise<void> {
  await updateDisplayName(displayName);
}

export async function joinConfirmedSessionFcfs(sessionId: string): Promise<void> {
  await joinConfirmed(sessionId);
}

export async function cancelSignupForSession(sessionId: string): Promise<void> {
  await cancelSignup(sessionId);
}

export async function markSessionPlayed(sessionId: string): Promise<void> {
  await markPlayed(sessionId);
}

export async function signOutFromClub(): Promise<void> {
  await signOut();
  revalidatePath("/", "layout");
  redirect("/sign-in");
}
