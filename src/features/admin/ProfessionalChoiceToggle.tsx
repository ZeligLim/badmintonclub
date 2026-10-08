"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { updateProfessionalChoice } from "./player-actions";

type ProfessionalChoiceToggleProps = {
  userId: string;
  displayName: string;
  canChooseProfessional: boolean;
  isProfessional: boolean;
};

export function ProfessionalChoiceToggle({
  userId,
  displayName,
  canChooseProfessional: initialEnabled,
  isProfessional,
}: ProfessionalChoiceToggleProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const switchId = `professional-choice-${userId}`;

  function changeProfessionalChoice(nextEnabled: boolean) {
    if (nextEnabled === enabled) {
      return;
    }
    if (
      !nextEnabled &&
      isProfessional &&
      !window.confirm(
        `Disable Professional choice for ${displayName}? Their playing level will be changed to Intermediate.`,
      )
    ) {
      return;
    }

    setErrorMessage("");
    startTransition(async () => {
      try {
        await updateProfessionalChoice(userId, nextEnabled);
        setEnabled(nextEnabled);
        router.refresh();
      } catch (error) {
        console.error("Could not update Professional level access.", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not update Professional level access.",
        );
      }
    });
  }

  return (
    <div className="flex min-w-36 flex-col gap-1">
      <div className="flex items-center gap-2">
        <Switch
          aria-label={`Allow ${displayName} to choose Professional`}
          checked={enabled}
          disabled={isPending}
          id={switchId}
          onCheckedChange={changeProfessionalChoice}
          size="sm"
        />
        <label className="text-xs text-muted-foreground" htmlFor={switchId}>
          {isPending ? "Saving…" : enabled ? "Enabled" : "Disabled"}
        </label>
      </div>
      {errorMessage ? (
        <p className="max-w-48 text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
