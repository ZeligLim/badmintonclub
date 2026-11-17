"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

import { updatePlayerLevelForCurrentUser, type PlayerLevel } from "@/features/sessions";
import { cn } from "@/lib/utils";

type LevelChoice = {
  value: PlayerLevel;
  label: string;
  description: string;
};

const LEVELS: LevelChoice[] = [
  {
    value: "BEGINNER",
    label: "Beginner",
    description: "New to badminton, or still learning to keep a rally going.",
  },
  {
    value: "INTERMEDIATE",
    label: "Intermediate",
    description: "You can rally consistently and play the basic shots.",
  },
  {
    value: "ADVANCED",
    label: "Advanced",
    description:
      "You can consistently play at least 3 of the 4 shots — clear, drop, smash, net.",
  },
];

/**
 * The one level picker.
 *
 * `blocking` is the first-login gate: the club added a new difficulty, so every
 * member has to answer once before they can sign up. Once answered it never
 * blocks again, and the header opens it in ordinary (dismissible) mode.
 */
export function LevelPickerDialog({
  currentLevel,
  canChooseProfessional,
  blocking = false,
  onClose,
  onSaved,
}: {
  currentLevel: PlayerLevel;
  canChooseProfessional: boolean;
  blocking?: boolean;
  onClose?: () => void;
  onSaved?: () => void;
}) {
  const [selected, setSelected] = useState<PlayerLevel>(currentLevel);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const choices: LevelChoice[] = canChooseProfessional
    ? [
        ...LEVELS,
        {
          value: "PROFESSIONAL",
          label: "Professional",
          description: "Invitation-only competitive level, assigned by the committee.",
        },
      ]
    : LEVELS;

  function save() {
    setError("");
    startTransition(async () => {
      try {
        await updatePlayerLevelForCurrentUser(selected);
        onSaved?.();
        onClose?.();
      } catch {
        setError("We couldn’t save your level. Please try again.");
      }
    });
  }

  return (
    <div
      aria-labelledby="level-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
    >
      {!blocking && (
        <button
          aria-label="Close"
          className="absolute inset-0 cursor-default"
          onClick={onClose}
          tabIndex={-1}
          type="button"
        />
      )}
      <div className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-6">
        <h2 className="text-lg font-semibold" id="level-dialog-title">
          Your playing level
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {blocking
            ? "We added an Advanced level. Pick the one that sounds most like you — you only need to do this once."
            : "Change the level we use when building your courts."}
        </p>

        <div className="mt-4 space-y-2">
          {choices.map((choice) => {
            const isSelected = selected === choice.value;
            return (
              <button
                aria-pressed={isSelected}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                  "min-h-16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/60",
                )}
                key={choice.value}
                onClick={() => setSelected(choice.value)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border",
                  )}
                >
                  {isSelected && <Check className="size-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{choice.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {choice.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-60"
            disabled={isPending}
            onClick={save}
            type="button"
          >
            {isPending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            Save my level
          </button>
          {!blocking && (
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
