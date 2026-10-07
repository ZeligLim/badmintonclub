"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  markSessionPlayed as markPlayed,
  cancelSignup,
  signOut,
  signUp,
} from "./actions";
import { loadDashboardData } from "./dashboard";
import type { DashboardData } from "../types";

export async function getDashboardData(): Promise<DashboardData> {
  return loadDashboardData();
}

export async function signUpForSession(sessionId: string): Promise<void> {
  await signUp(sessionId);
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
