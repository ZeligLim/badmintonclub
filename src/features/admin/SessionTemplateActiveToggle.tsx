"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setSessionTemplateActive } from "./template-actions";

type SessionTemplateActiveToggleProps = {
  templateId: string;
  templateName: string;
  isActive: boolean;
};

export function SessionTemplateActiveToggle({
  templateId,
  templateName,
  isActive: initialIsActive,
}: SessionTemplateActiveToggleProps) {
  const router = useRouter();
  const [isActive, setIsActive] = useState(initialIsActive);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const switchId = `session-template-active-${templateId}`;

  function changeActive(nextIsActive: boolean) {
    if (nextIsActive === isActive) {
      return;
    }

    setErrorMessage("");
    startTransition(async () => {
      try {
        await setSessionTemplateActive(templateId, nextIsActive);
        setIsActive(nextIsActive);
        router.refresh();
      } catch (error) {
        console.error("Could not update the session template.", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not update the session template.",
        );
      }
    });
  }

  return (
    <div className="flex min-w-24 flex-col gap-1">
      <div className="flex items-center gap-2">
        <Switch
          aria-label={`${templateName} active`}
          checked={isActive}
          disabled={isPending}
          id={switchId}
          onCheckedChange={changeActive}
          size="sm"
        />
        <label className="text-xs text-muted-foreground" htmlFor={switchId}>
          {isPending ? "Saving…" : isActive ? "Active" : "Paused"}
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
