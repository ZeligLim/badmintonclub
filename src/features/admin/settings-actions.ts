"use server";

import { revalidatePath } from "next/cache";

import {
  MATCHING_PRIORITY_KEYS,
  type MatchingPriorityKey,
} from "@/features/sessions/court-schedule";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

function isPriority(value: unknown): value is MatchingPriorityKey[] {
  return (
    Array.isArray(value) &&
    value.length === MATCHING_PRIORITY_KEYS.length &&
    MATCHING_PRIORITY_KEYS.every((key) => value.includes(key))
  );
}

export async function saveMatchingPriority(
  priority: MatchingPriorityKey[],
): Promise<void> {
  if (!isPriority(priority)) {
    throw new Error("That matching order is not valid.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_matching_priority", {
    p_priority: priority,
  });

  if (error) {
    logError("Could not save the matching order.", error);
    throw new Error("Could not save the matching order.");
  }

  revalidatePath("/admin");
}
