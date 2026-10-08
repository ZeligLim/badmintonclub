"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminUser } from "./data";

export async function updateSessionAvailability(
  sessionId: string,
  isHappening: boolean,
): Promise<void> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can change session availability.");
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      sessionId,
    ) ||
    typeof isHappening !== "boolean"
  ) {
    throw new Error("The session availability request is invalid.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_session_happening", {
    p_session_id: sessionId,
    p_happening: isHappening,
  });
  if (error) {
    throw new Error(`Could not update session availability: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/");
}
