"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminUser } from "./data";

export async function updateClubPlayerAccess(formData: FormData): Promise<void> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can manage player access.");
  }

  const userId = formData.get("user_id");
  const playerLevel = formData.get("player_level");
  const committeeValue = formData.get("is_committee");

  if (
    typeof userId !== "string" ||
    typeof playerLevel !== "string" ||
    (committeeValue !== "true" && committeeValue !== "false")
  ) {
    throw new Error("The player access request is invalid.");
  }
  if (!["BEGINNER", "INTERMEDIATE", "PROFESSIONAL"].includes(playerLevel)) {
    throw new Error("Select a valid player level.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_player_access", {
    p_user_id: userId,
    p_player_level: playerLevel,
    p_is_committee: committeeValue === "true",
  });
  if (error) {
    throw new Error(`Could not update player access: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/");
}
