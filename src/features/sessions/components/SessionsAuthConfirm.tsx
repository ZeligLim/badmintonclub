"use client";

import { useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type SessionsAuthConfirmProps = {
  tokenHash?: string;
  type?: string;
};

type SignInEmailOtpType = Extract<EmailOtpType, "signup" | "magiclink" | "email">;

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
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (error) {
        setErrorMessage(invalidLinkMessage);
        return;
      }

      router.replace("/");
    } catch {
      setErrorMessage(invalidLinkMessage);
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
): emailOtpType is SignInEmailOtpType {
  return (
    emailOtpType === "signup" ||
    emailOtpType === "magiclink" ||
    emailOtpType === "email"
  );
}
