import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import {
  sendMailjetEmails,
  type MailjetConfig,
  type MailjetEmail,
} from "../_shared/mailjet.ts";

type AuthEmailEvent = {
  user: {
    email: string;
    new_email?: string;
  };
  email_data: {
    email_action_type: string;
    redirect_to: string;
    site_url: string;
    token: string;
    token_hash: string;
    token_new: string;
    token_hash_new: string;
  };
};

const actionSubjects: Record<string, string> = {
  signup: "Confirm your Badminton Club email",
  invite: "Your Badminton Club invitation",
  magiclink: "Your Badminton Club sign-in link",
  recovery: "Reset your Badminton Club password",
  email_change: "Confirm your new email address",
  email: "Your Badminton Club verification code",
  reauthentication: "Your Badminton Club verification code",
};

const appConfirmationTypes = new Set(["magiclink", "signup", "email"]);

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let event: AuthEmailEvent | null;
  try {
    event = await readVerifiedEvent(request);
  } catch (error) {
    console.error("Could not verify the Supabase Auth hook.", error);
    return jsonResponse({ error: "The Auth hook is not configured." }, 503, true);
  }
  if (!event) {
    return jsonResponse({ error: "The Auth hook signature is invalid." }, 401);
  }

  const mailjetConfig = getMailjetConfig();
  if (!mailjetConfig) {
    return jsonResponse({ error: "Mailjet is not configured." }, 503, true);
  }

  try {
    await sendAuthEmails(event, mailjetConfig);
    return jsonResponse({}, 200);
  } catch (error) {
    console.error("Mailjet could not send a Supabase Auth email.", error);
    return jsonResponse({ error: "The authentication email could not be sent." }, 503, true);
  }
});

async function readVerifiedEvent(request: Request): Promise<AuthEmailEvent | null> {
  const configuredSecrets = Deno.env.get("SEND_EMAIL_HOOK_SECRETS");
  if (!configuredSecrets) {
    throw new Error("SEND_EMAIL_HOOK_SECRETS is not configured.");
  }

  const payload = await request.text();
  for (const configuredSecret of configuredSecrets.split("|")) {
    const secret = configuredSecret.replace(/^v1,whsec_/, "");
    try {
      const verified: unknown = new Webhook(secret).verify(
        payload,
        Object.fromEntries(request.headers),
      );
      if (isAuthEmailEvent(verified)) {
        return verified;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function sendAuthEmails(
  event: AuthEmailEvent,
  config: MailjetConfig,
): Promise<void> {
  const apiUrl = Deno.env.get("AUTH_API_URL");
  if (!apiUrl) {
    throw new Error("AUTH_API_URL is not configured.");
  }

  const { email_data: emailData, user } = event;
  const subject =
    actionSubjects[emailData.email_action_type] ??
    "Your Badminton Club account";

  if (emailData.email_action_type === "email_change") {
    const messages: MailjetEmail[] = [];
    if (emailData.token_hash_new) {
      messages.push(
        await createAuthEmail(
          apiUrl,
          emailData,
          user.email,
          emailData.token,
          emailData.token_hash_new,
          subject,
        ),
      );
    }
    if (emailData.token_hash && user.new_email) {
      messages.push(
        await createAuthEmail(
          apiUrl,
          emailData,
          user.new_email,
          emailData.token_new || emailData.token,
          emailData.token_hash,
          subject,
        ),
      );
    }
    if (messages.length === 0) {
      throw new Error("The email-change hook payload has no verification token.");
    }
    const results = await sendMailjetEmails(config, messages);
    if (results.some((sent) => !sent)) {
      throw new Error("Mailjet did not confirm every email-change message.");
    }
    return;
  }

  const results = await sendMailjetEmails(
    config,
    [await createAuthEmail(
      apiUrl,
      emailData,
      user.email,
      emailData.token,
      emailData.token_hash,
      subject,
    )],
  );
  if (!results[0]) {
    throw new Error("Mailjet did not confirm email delivery.");
  }
}

async function createAuthEmail(
  apiUrl: string,
  emailData: AuthEmailEvent["email_data"],
  to: string,
  token: string,
  tokenHash: string,
  subject: string,
): Promise<MailjetEmail> {
  if (!token || !tokenHash) {
    await logAuthEmailLinkDiagnostic(emailData, token, tokenHash);
    return {
      to,
      subject,
      text: "This is an account security notification from Badminton Club.",
    };
  }

  const verifyUrl = createVerificationUrl(apiUrl, emailData, tokenHash);
  await logAuthEmailLinkDiagnostic(emailData, token, tokenHash, verifyUrl);

  return {
    to,
    subject,
    text: `Use this one-time code: ${token}\n\nOr open this one-time link to continue:\n${verifyUrl}`,
  };
}

function createVerificationUrl(
  apiUrl: string,
  emailData: AuthEmailEvent["email_data"],
  tokenHash: string,
): URL {
  if (appConfirmationTypes.has(emailData.email_action_type)) {
    const confirmationUrl = new URL(
      "/auth/confirm",
      emailData.redirect_to || emailData.site_url,
    );
    confirmationUrl.searchParams.set("token_hash", tokenHash);
    confirmationUrl.searchParams.set("type", "email");
    return confirmationUrl;
  }

  const verificationUrl = new URL("/auth/v1/verify", apiUrl);
  verificationUrl.searchParams.set("token", tokenHash);
  verificationUrl.searchParams.set("type", emailData.email_action_type);
  verificationUrl.searchParams.set(
    "redirect_to",
    emailData.redirect_to || emailData.site_url,
  );
  return verificationUrl;
}

async function logAuthEmailLinkDiagnostic(
  emailData: AuthEmailEvent["email_data"],
  token: string,
  tokenHash: string,
  destination?: URL,
): Promise<void> {
  console.info("Auth email link diagnostic.", {
    email_action_type: emailData.email_action_type,
    token_exists: Boolean(token),
    token_hash_exists: Boolean(tokenHash),
    token_hash_length: tokenHash.length,
    redirect_to: safeLogLocation(emailData.redirect_to),
    site_url: safeLogLocation(emailData.site_url),
    destination_pathname: destination?.pathname ?? null,
    generated_type: destination?.searchParams.get("type") ?? null,
    token_hash_fingerprint: tokenHash
      ? await fingerprintTokenHash(tokenHash)
      : null,
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
    console.error("Could not fingerprint the Auth email token hash.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

function safeLogLocation(location: string): string {
  if (!location) {
    return "";
  }

  try {
    const url = new URL(location);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}

function getMailjetConfig() {
  const apiKey = Deno.env.get("MAILJET_API_KEY");
  const apiSecret = Deno.env.get("MAILJET_API_SECRET");
  const senderEmail = Deno.env.get("MAILJET_SENDER_EMAIL");
  const senderName = Deno.env.get("MAILJET_SENDER_NAME");
  if (
    !apiKey ||
    !apiSecret ||
    !senderEmail ||
    !senderName ||
    [apiKey, apiSecret, senderEmail, senderName].some((value) => value.startsWith("your-"))
  ) {
    return null;
  }

  return { apiKey, apiSecret, senderEmail, senderName };
}

function isAuthEmailEvent(value: unknown): value is AuthEmailEvent {
  if (
    typeof value !== "object" ||
    value === null ||
    !("user" in value) ||
    !("email_data" in value) ||
    typeof value.user !== "object" ||
    value.user === null ||
    typeof value.email_data !== "object" ||
    value.email_data === null
  ) {
    return false;
  }
  return (
    "email" in value.user &&
    typeof value.user.email === "string" &&
    (!("new_email" in value.user) || typeof value.user.new_email === "string") &&
    "email_action_type" in value.email_data &&
    typeof value.email_data.email_action_type === "string" &&
    "redirect_to" in value.email_data &&
    typeof value.email_data.redirect_to === "string" &&
    "site_url" in value.email_data &&
    typeof value.email_data.site_url === "string" &&
    "token" in value.email_data &&
    typeof value.email_data.token === "string" &&
    "token_hash" in value.email_data &&
    typeof value.email_data.token_hash === "string" &&
    "token_new" in value.email_data &&
    typeof value.email_data.token_new === "string" &&
    "token_hash_new" in value.email_data &&
    typeof value.email_data.token_hash_new === "string"
  );
}

function jsonResponse(
  body: object,
  status: number,
  retryable = false,
): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (retryable) {
    headers.set("retry-after", "true");
  }
  return new Response(JSON.stringify(body), { status, headers });
}
