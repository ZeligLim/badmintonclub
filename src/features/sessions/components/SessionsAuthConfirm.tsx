"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type SessionsAuthConfirmProps = {
  tokenHash?: string;
  type?: string;
};

const invalidLinkMessage =
  "This sign-in link is invalid or expired. Request a new one.";
const supportedEmailOtpTypes = new Set(["email", "magiclink", "signup"]);

export function SessionsAuthConfirm({
  tokenHash,
  type,
}: SessionsAuthConfirmProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    void logReceivedTokenHash(tokenHash, type);
  }, [tokenHash, type]);

  async function confirmSignIn() {
    if (!tokenHash || !isSupportedEmailOtpType(type)) {
      console.warn("Auth confirmation cannot call verifyOtp.", {
        tokenHashPresent: Boolean(tokenHash),
        tokenHashLength: tokenHash?.length ?? 0,
        type: getSafeEmailOtpType(type),
        verifyOtpCalled: false,
      });
      setErrorMessage(invalidLinkMessage);
      return;
    }

    setErrorMessage("");
    setIsVerifying(true);

    let verifyOtpCalled = false;
    try {
      const tokenHashFingerprint = await fingerprintTokenHash(tokenHash);
      console.info("Calling Supabase verifyOtp.", {
        tokenHashPresent: true,
        tokenHashLength: tokenHash.length,
        tokenHashFingerprint,
        type: getSafeEmailOtpType(type),
        verificationType: "email",
        verifyOtpCalled: true,
      });

      const supabase = createClient();
      verifyOtpCalled = true;
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "email",
      });

      if (error) {
        const sessionState = await logSessionState(supabase);
        console.error("Supabase rejected email token verification.", {
          code: error.code,
          message: sanitizeAuthErrorMessage(error.message),
          verifyOtpCalled: true,
          sessionReturned: false,
          ...sessionState,
        });
        setErrorMessage(invalidLinkMessage);
        return;
      }

      console.info("Supabase verifyOtp completed.", {
        verifyOtpCalled: true,
        sessionReturned: Boolean(data.session),
      });

      if (!data.session) {
        console.error("Supabase verified the email token without returning a session.", {
          verifyOtpCalled: true,
          sessionReturned: false,
        });
        setErrorMessage("Sign-in could not be completed. Request a new link and try again.");
        return;
      }

      const sessionState = await logSessionState(supabase);

      if (
        !sessionState.getSessionSeesSession ||
        !sessionState.getUserSeesUser
      ) {
        setErrorMessage("Sign-in could not be completed. Please request a new link.");
        return;
      }

      window.location.replace("/");
    } catch (error) {
      console.error("Email token verification failed unexpectedly.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        verifyOtpCalled,
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

async function logSessionState(
  supabase: ReturnType<typeof createClient>,
): Promise<{
  getSessionSeesSession: boolean;
  getUserSeesUser: boolean;
}> {
  const [sessionResult, userResult] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);
  const sessionState = {
    getSessionSeesSession: Boolean(sessionResult.data.session),
    getUserSeesUser: Boolean(userResult.data.user),
  };

  console.info("Supabase session checked after email verification.", {
    ...sessionState,
    getSessionError: sessionResult.error
      ? sanitizeAuthErrorMessage(sessionResult.error.message)
      : null,
    getUserError: userResult.error
      ? sanitizeAuthErrorMessage(userResult.error.message)
      : null,
  });

  return sessionState;
}

function isSupportedEmailOtpType(
  emailOtpType: string | undefined,
): emailOtpType is "email" | "magiclink" | "signup" {
  return emailOtpType !== undefined && supportedEmailOtpTypes.has(emailOtpType);
}

function getSafeEmailOtpType(emailOtpType: string | undefined): string {
  return emailOtpType && supportedEmailOtpTypes.has(emailOtpType)
    ? emailOtpType
    : "unsupported";
}

async function logReceivedTokenHash(
  tokenHash: string | undefined,
  type: string | undefined,
): Promise<void> {
  console.info("Auth confirmation link received.", {
    tokenHashPresent: Boolean(tokenHash),
    tokenHashLength: tokenHash?.length ?? 0,
    tokenHashFingerprint: tokenHash
      ? await fingerprintTokenHash(tokenHash)
      : null,
    type: getSafeEmailOtpType(type),
    verifyOtpCalled: false,
  });
}

async function fingerprintTokenHash(tokenHash: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(tokenHash),
    );

    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } catch (error) {
    console.error("Could not fingerprint the confirmation token hash.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

function sanitizeAuthErrorMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\bBearer\s+\S+/gi, "[redacted-credential]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]")
    .replace(/\b(token_hash|access_token|refresh_token|token)\s*[:=]\s*[^,\s;]+/gi, "$1=[redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-value]")
    .replace(/\b\d{6}\b/g, "[redacted-value]")
    .slice(0, 500);
}
