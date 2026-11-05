"use server";

import { isUuid } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminUser } from "./data";

export async function updateClubCommitteeStatus(
  userId: string,
  isCommittee: boolean,
): Promise<void> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can manage committee status.");
  }

  if (
    typeof userId !== "string" ||
    !isUuid(userId) ||
    typeof isCommittee !== "boolean"
  ) {
    throw new Error("The committee status request is invalid.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_committee_status", {
    p_user_id: userId,
    p_is_committee: isCommittee,
  });
  if (error) {
    throw new Error(`Could not update committee status: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function updateProfessionalChoice(
  userId: string,
  enabled: boolean,
): Promise<void> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can change Professional level access.");
  }
  if (
    !isUuid(userId) ||
    typeof enabled !== "boolean"
  ) {
    throw new Error("The Professional level access request is invalid.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_professional_choice", {
    p_user_id: userId,
    p_enabled: enabled,
  });
  if (error) {
    throw new Error(`Could not update Professional level access: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/");
}
