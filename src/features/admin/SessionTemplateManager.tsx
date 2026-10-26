"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CLUB_SESSION_DAYS } from "@/lib/sessions/schedule";
import type { SessionAllocationMode } from "@/features/sessions";
import type { AdminSessionTemplate } from "./data";
import { SessionTemplateActiveToggle } from "./SessionTemplateActiveToggle";
import {
  publishScheduledSessions,
  saveSessionTemplate,
  type SessionTemplateInput,
} from "./template-actions";

type SessionTemplateManagerProps = {
  templates: AdminSessionTemplate[];
};

type TemplateFormState = {
  templateId: string | null;
  name: string;
  weekday: number;
  startsAt: string;
  durationMinutes: string;
  capacity: string;
  fee: string;
  allocationMode: SessionAllocationMode;
  committeeAutoSignup: boolean;
  signupOpensLeadDays: string;
  signupOpensAt: string;
  confirmationLeadDays: string;
  confirmationAt: string;
  isActive: boolean;
  validFrom: string;
  validUntil: string;
};

const EMPTY_FORM: TemplateFormState = {
  templateId: null,
  name: "",
  weekday: 1,
  startsAt: "18:00",
  durationMinutes: "60",
  capacity: "16",
  fee: "0",
  allocationMode: "lottery",
  committeeAutoSignup: true,
  signupOpensLeadDays: "4",
  signupOpensAt: "00:00",
  confirmationLeadDays: "1",
  confirmationAt: "00:00",
  isActive: true,
  validFrom: "",
  validUntil: "",
};

export function SessionTemplateManager({
  templates,
}: SessionTemplateManagerProps) {
  const router = useRouter();
  const [form, setForm] = useState<TemplateFormState>(EMPTY_FORM);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateForm<Key extends keyof TemplateFormState>(
    key: Key,
    value: TemplateFormState[Key],
  ) {
    setForm((currentForm) => ({ ...currentForm, [key]: value }));
  }

  function startEditing(template: AdminSessionTemplate) {
    setErrorMessage("");
    setStatusMessage("");
    setForm({
      templateId: template.id,
      name: template.name,
      weekday: template.weekday,
      startsAt: template.startsAt,
      durationMinutes: String(template.durationMinutes),
      capacity: String(template.capacity),
      fee: (template.feeCents / 100).toFixed(2).replace(/\.00$/, ""),
      allocationMode: template.allocationMode,
      committeeAutoSignup: template.committeeAutoSignup,
      signupOpensLeadDays: String(template.signupOpensLeadDays),
      signupOpensAt: template.signupOpensAt,
      confirmationLeadDays: String(template.confirmationLeadDays),
      confirmationAt: template.confirmationAt,
      isActive: template.isActive,
      validFrom: template.validFrom ?? "",
      validUntil: template.validUntil ?? "",
    });
  }

  function cancelEditing() {
    setErrorMessage("");
    setStatusMessage("");
    setForm(EMPTY_FORM);
  }

  function saveTemplate() {
    setErrorMessage("");
    setStatusMessage("");

    const input: SessionTemplateInput = {
      templateId: form.templateId,
      name: form.name,
      weekday: Number(form.weekday),
      startsAt: form.startsAt,
      durationMinutes: Number(form.durationMinutes),
      capacity: Number(form.capacity),
      feeCents: Math.round(Number(form.fee) * 100),
      allocationMode: form.allocationMode,
      committeeAutoSignup: form.committeeAutoSignup,
      signupOpensLeadDays: Number(form.signupOpensLeadDays),
      signupOpensAt: form.signupOpensAt,
      confirmationLeadDays: Number(form.confirmationLeadDays),
      confirmationAt: form.confirmationAt,
      isActive: form.isActive,
      validFrom: form.validFrom || null,
      validUntil: form.validUntil || null,
    };

    if (!Number.isFinite(input.feeCents)) {
      setErrorMessage("Enter the fee as a number of euros.");
      return;
    }

    startTransition(async () => {
      try {
        await saveSessionTemplate(input);
        setForm(EMPTY_FORM);
        setStatusMessage(
          input.templateId
            ? "Template saved. Publish the sessions to apply the changes."
            : "Template created. Publish the sessions to apply the changes.",
        );
        router.refresh();
      } catch (error) {
        console.error("Could not save the session template.", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not save the session template.",
        );
      }
    });
  }

  function publishSessions() {
    setErrorMessage("");
    setStatusMessage("");

    startTransition(async () => {
      try {
        const result = await publishScheduledSessions();
        setStatusMessage(
          `Published ${result.created} new ${
            result.created === 1 ? "session" : "sessions"
          }, updated ${result.updated}, removed ${result.removed}.`,
        );
        router.refresh();
      } catch (error) {
        console.error("Could not publish the club sessions.", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not publish the club sessions.",
        );
      }
    });
  }

  return (
    <section className="mb-10">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Recurring session templates</h2>
        <Button
          className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={isPending}
          onClick={publishSessions}
          size="sm"
        >
          {isPending ? "Publishing…" : "Publish sessions"}
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Templates describe the club&rsquo;s recurring sessions. Sessions are
        created from them and keep their own copy of the rules, so editing a
        template never changes a session that has already been published.
      </p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Template
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Day and time
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Places
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Allocation
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Sign-ups
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Active
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr className="border-t border-border/50 bg-card">
                <td
                  className="px-4 py-2.5 text-muted-foreground"
                  colSpan={7}
                >
                  No templates yet. Add one below.
                </td>
              </tr>
            ) : (
              templates.map((template) => (
                <tr className="border-t border-border/50 bg-card" key={template.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{template.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFee(template.feeCents)} ·{" "}
                      {template.committeeAutoSignup
                        ? "committee auto sign-up"
                        : "no committee auto sign-up"}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    {CLUB_SESSION_DAYS[template.weekday - 1]} {template.startsAt}
                    <span className="block text-xs text-muted-foreground">
                      {formatDuration(template.durationMinutes)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{template.capacity}</td>
                  <td className="px-4 py-2.5">
                    {template.allocationMode === "fcfs"
                      ? "First come, first served"
                      : "Fairness draw"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    Open {template.signupOpensLeadDays} days before at{" "}
                    {template.signupOpensAt}
                    <span className="block">
                      Close {template.confirmationLeadDays} days before at{" "}
                      {template.confirmationAt}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <SessionTemplateActiveToggle
                      isActive={template.isActive}
                      templateId={template.id}
                      templateName={template.name}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      className="inline-flex h-7 items-center justify-center rounded-md px-2.5 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => startEditing(template)}
                      type="button"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h3 className="mb-2 mt-8 text-sm font-semibold">
        {form.templateId ? "Edit template" : "New template"}
      </h3>
      <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name">
          <input
            className="h-9 w-full rounded-md bg-muted px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => updateForm("name", event.target.value)}
            placeholder="Monday evening"
            type="text"
            value={form.name}
          />
        </Field>
        <Field label="Day">
          <select
            className="h-9 w-full rounded-md bg-muted px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => updateForm("weekday", Number(event.target.value))}
            value={form.weekday}
          >
            {CLUB_SESSION_DAYS.map((day, index) => (
              <option key={day} value={index + 1}>
                {day}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start time">
          <input
            className="h-9 w-full rounded-md bg-muted px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => updateForm("startsAt", event.target.value)}
            type="time"
            value={form.startsAt}
          />
        </Field>
        <Field label="Length (minutes)">
          <input
            className="h-9 w-full rounded-md bg-muted px-2.5 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            min={30}
            max={360}
            onChange={(event) =>
              updateForm("durationMinutes", event.target.value)
            }
            step={15}
            type="number"
            value={form.durationMinutes}
          />
        </Field>
        <Field label="Capacity (players)">
          <input
            className="h-9 w-full rounded-md bg-muted px-2.5 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            min={4}
            max={64}
            onChange={(event) => updateForm("capacity", event.target.value)}
            step={4}
            type="number"
            value={form.capacity}
          />
        </Field>
        <Field label="Fee per player (€)">
          <input
            className="h-9 w-full rounded-md bg-muted px-2.5 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            min={0}
            onChange={(event) => updateForm("fee", event.target.value)}
            step={0.5}
            type="number"
            value={form.fee}
          />
        </Field>
        <Field label="Allocation">
          <select
            className="h-9 w-full rounded-md bg-muted px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) =>
              updateForm("allocationMode", event.target.value as SessionAllocationMode)
            }
            value={form.allocationMode}
          >
            <option value="lottery">Fairness draw</option>
            <option value="fcfs">First come, first served</option>
          </select>
        </Field>
        <Field label="Sign-ups open">
          <div className="flex items-center gap-2">
            <input
              aria-label="Days before the session that sign-ups open"
              className="h-9 w-20 rounded-md bg-muted px-2.5 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              max={21}
              min={0}
              onChange={(event) =>
                updateForm("signupOpensLeadDays", event.target.value)
              }
              type="number"
              value={form.signupOpensLeadDays}
            />
            <span className="text-xs text-muted-foreground">days before at</span>
            <input
              aria-label="Time sign-ups open"
              className="h-9 w-28 rounded-md bg-muted px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) =>
                updateForm("signupOpensAt", event.target.value)
              }
              type="time"
              value={form.signupOpensAt}
            />
          </div>
        </Field>
        <Field label="Sign-ups close">
          <div className="flex items-center gap-2">
            <input
              aria-label="Days before the session that sign-ups close"
              className="h-9 w-20 rounded-md bg-muted px-2.5 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              max={21}
              min={0}
              onChange={(event) =>
                updateForm("confirmationLeadDays", event.target.value)
              }
              type="number"
              value={form.confirmationLeadDays}
            />
            <span className="text-xs text-muted-foreground">days before at</span>
            <input
              aria-label="Time sign-ups close"
              className="h-9 w-28 rounded-md bg-muted px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) =>
                updateForm("confirmationAt", event.target.value)
              }
              type="time"
              value={form.confirmationAt}
            />
          </div>
        </Field>
        <Field label="Runs from (optional)">
          <input
            className="h-9 w-full rounded-md bg-muted px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => updateForm("validFrom", event.target.value)}
            type="date"
            value={form.validFrom}
          />
        </Field>
        <Field label="Runs until (optional)">
          <input
            className="h-9 w-full rounded-md bg-muted px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => updateForm("validUntil", event.target.value)}
            type="date"
            value={form.validUntil}
          />
        </Field>
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={form.committeeAutoSignup}
              onChange={(event) =>
                updateForm("committeeAutoSignup", event.target.checked)
              }
              type="checkbox"
            />
            Committee members are signed up automatically
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={form.isActive}
              onChange={(event) => updateForm("isActive", event.target.checked)}
              type="checkbox"
            />
            Active
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={isPending} onClick={saveTemplate} size="sm">
          {isPending ? "Saving…" : form.templateId ? "Save template" : "Add template"}
        </Button>
        {form.templateId ? (
          <Button onClick={cancelEditing} size="sm" variant="ghost">
            Cancel
          </Button>
        ) : null}
        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {statusMessage ? (
          <p className="text-sm text-muted-foreground" role="status">
            {statusMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function formatFee(feeCents: number) {
  if (feeCents === 0) {
    return "Free";
  }
  if (feeCents % 100 === 0) {
    return `€${feeCents / 100}`;
  }

  return `€${(feeCents / 100).toFixed(2)}`;
}

function formatDuration(durationMinutes: number) {
  const hours = durationMinutes / 60;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}
