import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logError } from "@/lib/log";
import {
  DEFAULT_MATCHING_PRIORITY,
  toMatchingPriority,
  type MatchingPriorityKey,
} from "@/features/sessions/court-schedule";

/**
 * The club's matching order: which preference outranks which when two
 * timetables are compared. Fairness and the hard rules always come first.
 */
export async function readMatchingPriority(
  supabase: SupabaseClient,
): Promise<MatchingPriorityKey[]> {
  const { data, error } = await supabase
    .from("matching_settings")
    .select("priority")
    .maybeSingle();
  if (error) {
    logError("Could not read the matching order.", error);
    return [...DEFAULT_MATCHING_PRIORITY];
  }
  return toMatchingPriority(data?.priority);
}
