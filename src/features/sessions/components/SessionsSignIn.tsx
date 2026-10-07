"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SessionsSignIn() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSendingLink, setIsSendingLink] = useState(false);

  async function sendSignInLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    const normalizedEmail = email.replace(/\s/g, "");
    if (!/^[^@\s]+@atu\.ie$/i.test(normalizedEmail)) {
      setErrorMessage("Use your ATU email address ending in @atu.ie.");
      return;
    }

    setEmail(normalizedEmail);
    setIsSendingLink(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: window.location.origin },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setMessage(
        "Supabase accepted the request. Delivery depends on this project’s email provider.",
      );
    } catch (error) {
      console.error("Could not send the ATU sign-in link.", error);
      setErrorMessage("We couldn’t send a sign-in link. Please try again.");
    } finally {
      setIsSendingLink(false);
    }
  }

  return (
    <section aria-labelledby="sign-in-heading" className="mt-10">
      <h1 className="text-3xl font-medium tracking-tight" id="sign-in-heading">
        Sign in
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Enter your @atu.ie email and we’ll send you a secure sign-in link.
      </p>
      <form
        className="mt-7 flex max-w-md flex-col gap-4"
        onSubmit={sendSignInLink}
      >
        <label className="flex-1 text-xs font-medium text-muted-foreground">
          Email address
          <input
            autoComplete="email"
            className="mt-2 h-11 w-full rounded-lg bg-white px-3 text-base text-foreground outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:ring-3 focus-visible:ring-ring/25"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@atu.ie"
            required
            inputMode="email"
            type="text"
            value={email}
          />
        </label>
        <Button
          className="h-11 self-start"
          disabled={isSendingLink}
          type="submit"
        >
          {isSendingLink ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              Sending
            </>
          ) : (
            <>
              Send sign-in link <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>
      </form>

      {(message || errorMessage) && (
        <p
          aria-live="polite"
          className={`mt-4 max-w-md text-sm ${
            errorMessage ? "text-destructive" : "text-primary"
          }`}
          role={errorMessage ? "alert" : "status"}
        >
          {errorMessage || message}
        </p>
      )}
    </section>
  );
}
