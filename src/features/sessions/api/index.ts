"use server";

import { markSessionPlayed as markPlayed, cancelSignup, signUp } from "./actions";
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
