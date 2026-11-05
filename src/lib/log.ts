/**
 * The only place that writes to the console.
 *
 * Structured single-object logs are readable in Vercel's log viewer and easy to
 * grep. Errors keep their name, message and stack so a production failure can be
 * traced back to a line; anything else is printed as-is.
 */

type LogContext = Record<string, unknown>;

function describe(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }

  return error;
}

function entry(message: string, details: unknown, context?: LogContext): Record<string, unknown> {
  const base: Record<string, unknown> = { message };

  if (details !== undefined) {
    if (details !== null && typeof details === "object" && !(details instanceof Error)) {
      Object.assign(base, details as LogContext);
    } else {
      base.error = describe(details);
    }
  }

  return context ? { ...base, ...context } : base;
}

export function logError(
  message: string,
  error?: unknown,
  context?: LogContext,
): void {
  console.error(entry(message, error, context));
}

export function logWarning(
  message: string,
  details?: unknown,
  context?: LogContext,
): void {
  console.warn(entry(message, details, context));
}

export function logInfo(message: string, context?: LogContext): void {
  console.info(entry(message, context));
}
