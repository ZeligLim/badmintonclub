"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type SessionsAuthConfirmProps = {
  tokenHash?: string;
  type?: string;
};

const invalidLinkMessage =
  "This sign-in link is invalid or expired. Request a new one.";

export function SessionsAuthConfirm({
  tokenHash,
  type,
}: SessionsAuthConfirmProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  async function confirmSignIn() {
    if (!tokenHash || !isSupportedEmailOtpType(type)) {
      setErrorMessage(invalidLinkMessage);
      return;
    }

    setErrorMessage("");
    setIsVerifying(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (error) {
        console.error("Supabase rejected email token verification.", {
          status: error.status,
          code: error.code,
        });
        setErrorMessage(invalidLinkMessage);
        return;
      }

      if (!data.session) {
        console.error("Supabase verified the email token without returning a session.");
        setErrorMessage("Sign-in could not be completed. Request a new link and try again.");
        return;
      }

      router.replace("/");
    } catch (error) {
      console.error("Email token verification failed unexpectedly.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      setErrorMessage("Sign-in could not be completed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  }

  if (!tokenHash || !isSupportedEmailOtpType(type)) {
    return (
      <section aria-labelledby="auth-confirm-heading" className="mt-10">
        <h1 className="text-3xl font-medium tracking-tight" id="auth-confirm-heading">
          Confirm sign-in
        </h1>
        <p className="mt-4 max-w-md text-sm text-destructive" role="alert">
          {invalidLinkMessage}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="auth-confirm-heading" className="mt-10">
      <h1 className="text-3xl font-medium tracking-tight" id="auth-confirm-heading">
        Confirm sign-in
      </h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Select the button below to complete sign-in.
      </p>
      <Button
        className="mt-6 h-11 px-5"
        disabled={isVerifying}
        onClick={confirmSignIn}
        type="button"
      >
        {isVerifying ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          "Continue"
        )}
      </Button>
      {errorMessage && (
        <p className="mt-4 max-w-md text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
    </section>
  );
}

function isSupportedEmailOtpType(
  emailOtpType: string | undefined,
): emailOtpType is "email" {
  return emailOtpType === "email";
}
