"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updatePaymentStatus } from "./session-actions";
import { logError } from "@/lib/log";
import type { PaymentStatus } from "./data";

type PaymentStatusSelectProps = {
  sessionId: string;
  userId: string;
  displayName: string;
  paymentStatus: PaymentStatus;
};

export function PaymentStatusSelect({
  sessionId,
  userId,
  displayName,
  paymentStatus: initialPaymentStatus,
}: PaymentStatusSelectProps) {
  const router = useRouter();
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function changePaymentStatus(value: string) {
    if (value !== "unpaid" && value !== "paid" && value !== "waived") {
      return;
    }
    if (value === paymentStatus) return;

    setErrorMessage("");
    startTransition(async () => {
      try {
        await updatePaymentStatus(sessionId, userId, value);
        setPaymentStatus(value);
        router.refresh();
      } catch (error) {
        logError("Could not record a payment.", error);
        setErrorMessage(
          error instanceof Error ? error.message : "Could not record a payment.",
        );
      }
    });
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <select
        aria-label={`${displayName} payment`}
        className="h-7 rounded-md border-0 bg-white px-2 py-0 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => changePaymentStatus(event.target.value)}
        value={paymentStatus}
      >
        <option value="unpaid">Unpaid</option>
        <option value="paid">Paid</option>
        <option value="waived">Waived</option>
      </select>
      {isPending ? (
        <span className="text-xs text-muted-foreground" role="status">
          Saving…
        </span>
      ) : null}
      {errorMessage ? (
        <span className="max-w-48 text-xs text-destructive" role="alert">
          {errorMessage}
        </span>
      ) : null}
    </span>
  );
}
