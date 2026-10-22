"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SessionAllocationMode } from "@/features/sessions";
import { requireAdminUser } from "./data";

export type SessionTemplateInput = {
  templateId: string | null;
  name: string;
  /** ISO weekday, 1 = Monday ... 7 = Sunday. */
  weekday: number;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  feeCents: number;
  allocationMode: SessionAllocationMode;
  committeeAutoSignup: boolean;
  signupOpensLeadDays: number;
  signupOpensAt: string;
  confirmationLeadDays: number;
  confirmationAt: string;
  isActive: boolean;
  validFrom: string | null;
  validUntil: string | null;
};

export type PublishResult = {
  created: number;
  updated: number;
  removed: number;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveSessionTemplate(
  input: SessionTemplateInput,
): Promise<void> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can manage session templates.");
  }

  const template = validateTemplateInput(input);

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_upsert_session_template", {
    p_template_id: template.templateId,
    p_name: template.name,
    p_weekday: template.weekday,
    p_starts_at: template.startsAt,
    p_duration_minutes: template.durationMinutes,
    p_capacity: template.capacity,
    p_fee_cents: template.feeCents,
    p_allocation_mode: template.allocationMode,
    p_committee_auto_signup: template.committeeAutoSignup,
    p_signup_opens_lead_days: template.signupOpensLeadDays,
    p_signup_opens_at: template.signupOpensAt,
    p_confirmation_lead_days: template.confirmationLeadDays,
    p_confirmation_at: template.confirmationAt,
    p_is_active: template.isActive,
    p_valid_from: template.validFrom,
    p_valid_until: template.validUntil,
  });
  if (error) {
    throw new Error(`Could not save the session template: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function setSessionTemplateActive(
  templateId: string,
  isActive: boolean,
): Promise<void> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can manage session templates.");
  }
  if (!UUID_PATTERN.test(templateId) || typeof isActive !== "boolean") {
    throw new Error("The session template request is invalid.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_session_template_active", {
    p_template_id: templateId,
    p_is_active: isActive,
  });
  if (error) {
    throw new Error(`Could not update the session template: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

/**
 * Brings the sessions that have not been published yet in line with the
 * templates. Sessions whose sign-ups have already opened are left untouched.
 */
export async function publishScheduledSessions(): Promise<PublishResult> {
  if (!(await requireAdminUser())) {
    throw new Error("Only a club administrator can publish club sessions.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_publish_scheduled_sessions");
  if (error) {
    throw new Error(`Could not publish the club sessions: ${error.message}`);
  }

  const result = data?.[0];

  revalidatePath("/admin");
  revalidatePath("/");

  return {
    created: result?.created_count ?? 0,
    updated: result?.updated_count ?? 0,
    removed: result?.removed_count ?? 0,
  };
}

function validateTemplateInput(input: SessionTemplateInput): SessionTemplateInput {
  const name = input.name?.trim() ?? "";
  const validFrom = input.validFrom || null;
  const validUntil = input.validUntil || null;
  if (name.length < 1 || name.length > 80) {
    throw new Error("Give the session template a name.");
  }
  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) {
    throw new Error("Choose a day of the week.");
  }
  if (!TIME_PATTERN.test(input.startsAt)) {
    throw new Error("Choose a start time.");
  }
  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 30 ||
    input.durationMinutes > 360
  ) {
    throw new Error("Sessions must run for 30 to 360 minutes.");
  }
  if (
    !Number.isInteger(input.capacity) ||
    input.capacity < 4 ||
    input.capacity > 64 ||
    input.capacity % 4 !== 0
  ) {
    throw new Error("Capacity must be 4 to 64 players in multiples of four.");
  }
  if (
    !Number.isInteger(input.feeCents) ||
    input.feeCents < 0 ||
    input.feeCents > 10000
  ) {
    throw new Error("The fee must be between 0 and 100 euros.");
  }
  if (input.allocationMode !== "lottery" && input.allocationMode !== "fcfs") {
    throw new Error("Choose how places are allocated.");
  }
  if (
    !Number.isInteger(input.signupOpensLeadDays) ||
    input.signupOpensLeadDays < 0 ||
    input.signupOpensLeadDays > 21
  ) {
    throw new Error("Sign-ups must open between 0 and 21 days before the session.");
  }
  if (
    !Number.isInteger(input.confirmationLeadDays) ||
    input.confirmationLeadDays < 0 ||
    input.confirmationLeadDays > 21
  ) {
    throw new Error("Sign-ups must close between 0 and 21 days before the session.");
  }
  if (!TIME_PATTERN.test(input.signupOpensAt)) {
    throw new Error("Choose the time sign-ups open.");
  }
  if (!TIME_PATTERN.test(input.confirmationAt)) {
    throw new Error("Choose the time sign-ups close.");
  }
  if (input.templateId !== null && !UUID_PATTERN.test(input.templateId)) {
    throw new Error("The session template request is invalid.");
  }
  if (validFrom !== null && !DATE_PATTERN.test(validFrom)) {
    throw new Error("The start date is invalid.");
  }
  if (validUntil !== null && !DATE_PATTERN.test(validUntil)) {
    throw new Error("The end date is invalid.");
  }
  if (validFrom !== null && validUntil !== null && validUntil < validFrom) {
    throw new Error("The end date must not be before the start date.");
  }

  return {
    ...input,
    name,
    validFrom,
    validUntil,
  };
}
