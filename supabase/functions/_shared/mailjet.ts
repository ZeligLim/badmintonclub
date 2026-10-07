export type MailjetEmail = {
  to: string;
  toName?: string;
  subject: string;
  text: string;
};

export type MailjetConfig = {
  apiKey: string;
  apiSecret: string;
  senderEmail: string;
  senderName: string;
};

type MailjetResponse = {
  ErrorInfo?: string;
  ErrorMessage?: string;
  Messages?: Array<{
    Status?: string;
    To?: Array<{ MessageID?: number; MessageUUID?: string }>;
    Errors?: Array<{ ErrorInfo?: string; ErrorMessage?: string }>;
  }>;
};

export async function sendMailjetEmails(
  config: MailjetConfig,
  emails: MailjetEmail[],
): Promise<boolean[]> {
  if (emails.length === 0) {
    return [];
  }

  const response = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${config.apiKey}:${config.apiSecret}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Messages: emails.map((email) => ({
        From: { Email: config.senderEmail, Name: config.senderName },
        To: [{ Email: email.to, ...(email.toName ? { Name: email.toName } : {}) }],
        Subject: email.subject,
        TextPart: email.text,
      })),
    }),
    signal: AbortSignal.timeout(4000),
  });

  let result: MailjetResponse | null = null;
  try {
    result = (await response.clone().json()) as MailjetResponse;
  } catch {
    console.error("Mailjet returned an unreadable response.", {
      httpStatus: response.status,
    });
  }

  if (!response.ok) {
    console.error("Mailjet rejected the send request.", {
      httpStatus: response.status,
      ...getMailjetResponseLogDetails(result),
    });
    throw new Error(`Mailjet rejected email delivery with HTTP ${response.status}.`);
  }
  if (!result) {
    throw new Error(`Mailjet returned invalid JSON with HTTP ${response.status}.`);
  }

  const statuses = emails.map(
    (_, index) => result.Messages?.[index]?.Status ?? "unknown",
  );
  console.info("Mailjet send request completed.", {
    httpStatus: response.status,
    ...getMailjetResponseLogDetails(result),
  });
  return statuses.map((status) => status === "success");
}

function getMailjetResponseLogDetails(result: MailjetResponse | null) {
  return {
    messageResults: result?.Messages?.map((message) => ({
      status: message.Status ?? "unknown",
      messageIds: message.To?.map(({ MessageID, MessageUUID }) => ({
        MessageID,
        MessageUUID,
      })) ?? [],
      errors: message.Errors?.map(({ ErrorInfo, ErrorMessage }) => ({
        ErrorInfo: sanitizeMailjetError(ErrorInfo),
        ErrorMessage: sanitizeMailjetError(ErrorMessage),
      })) ?? [],
    })) ?? [],
    ErrorInfo: sanitizeMailjetError(result?.ErrorInfo),
    ErrorMessage: sanitizeMailjetError(result?.ErrorMessage),
  };
}

function sanitizeMailjetError(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value
    ?.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(token|secret|api[_ -]?key|authorization)\s*[:=]\s*[^,\s;]+/gi, "$1=[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]")
    .slice(0, 500);
}
