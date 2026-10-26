"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

function assertDevelopment() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Test-account management is only available in development.");
  }
}

function normalizeEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

export async function createTestAccount(formData: FormData) {
  assertDevelopment();
  const email = normalizeEmail(formData.get("email"));
  const displayName = String(formData.get("displayName") ?? "").trim();
  const role = String(formData.get("role") ?? "player");
  if (!email.endsWith("@atu.ie")) {
    throw new Error("Use an @atu.ie email address.");
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: displayName || email.split("@")[0] },
  });
  if (error) throw new Error(error.message);
  if (role === "committee-admin") {
    await supabase
      .from("profiles")
      .update({ is_committee: true, is_committee_admin: true })
      .eq("id", data.user.id);
  } else if (role === "committee") {
    await supabase
      .from("profiles")
      .update({ is_committee: true })
      .eq("id", data.user.id);
  }
  revalidatePath("/dev");
}

export async function deleteTestAccount(userId: string) {
  assertDevelopment();
  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  revalidatePath("/dev");
}

export async function seedTestAccounts() {
  assertDevelopment();
  const supabase = createAdminClient();
  const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = new Set((data?.users ?? []).map((user) => user.email?.toLowerCase()));

  for (let index = 1; index <= 40; index += 1) {
    const number = String(index).padStart(2, "0");
    const email = `player${number}@atu.ie`;
    if (existing.has(email)) continue;
    const { data: created, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { display_name: `Player ${number}` },
    });
    if (error || !created?.user) continue;
    await supabase
      .from("profiles")
      .update({ player_level: "INTERMEDIATE" })
      .eq("id", created.user.id);
    existing.add(email);
  }
  revalidatePath("/dev");
}