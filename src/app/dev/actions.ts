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

export async function seedTestAccounts(formData: FormData) {
  assertDevelopment();
  const requestedCount = Number(formData.get("seedCount"));
  const count =
    Number.isInteger(requestedCount) && requestedCount > 0 && requestedCount <= 200
      ? requestedCount
      : 40;

  const supabase = createAdminClient();
  const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = new Set((data?.users ?? []).map((user) => user.email?.toLowerCase()));

  for (let index = 1; index <= count; index += 1) {
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


export async function addDevFriend(formData: FormData) {
  assertDevelopment();
  const userEmail = normalizeEmail(formData.get("userEmail"));
  const friendEmail = normalizeEmail(formData.get("friendEmail"));
  if (!userEmail.endsWith("@atu.ie") || !friendEmail.endsWith("@atu.ie")) {
    throw new Error("Both accounts must use @atu.ie email addresses.");
  }
  if (userEmail === friendEmail) {
    throw new Error("Choose two different accounts.");
  }

  const supabase = createAdminClient();
  const { data: users, error: usersError } = await supabase.rpc("list_dev_test_users");
  if (usersError) throw new Error(usersError.message);
  const user = (users ?? []).find((item: { email: string }) => item.email.toLowerCase() === userEmail);
  const friend = (users ?? []).find((item: { email: string }) => item.email.toLowerCase() === friendEmail);
  if (!user || !friend) throw new Error("Both accounts must already exist.");

  const { error } = await supabase
    .from("club_friend_list")
    .insert({ user_id: user.id, friend_user_id: friend.id });
  if (error && error.code !== "23505") throw new Error(error.message);
  revalidatePath("/dev");
}

export async function removeDevFriend(formData: FormData) {
  assertDevelopment();
  const userEmail = normalizeEmail(formData.get("userEmail"));
  const friendEmail = normalizeEmail(formData.get("friendEmail"));
  const supabase = createAdminClient();
  const { data: users, error: usersError } = await supabase.rpc("list_dev_test_users");
  if (usersError) throw new Error(usersError.message);
  const user = (users ?? []).find((item: { email: string }) => item.email.toLowerCase() === userEmail);
  const friend = (users ?? []).find((item: { email: string }) => item.email.toLowerCase() === friendEmail);
  if (!user || !friend) throw new Error("Account not found.");

  const { error } = await supabase
    .from("club_friend_list")
    .delete()
    .eq("user_id", user.id)
    .eq("friend_user_id", friend.id);
  if (error) throw new Error(error.message);
  revalidatePath("/dev");
}


export async function randomSessionSignups(formData: FormData) {
  assertDevelopment();
  const requestedCount = Number(formData.get("signupCount"));
  const count =
    Number.isInteger(requestedCount) && requestedCount > 0 && requestedCount <= 100
      ? requestedCount
      : 5;
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("dev_random_session_signups", {
    p_count: count,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dev");
  revalidatePath("/");
}
