/**
 * Shared display formatting.
 *
 * Members and committee pages used to keep private copies of these (some
 * printing "1.5 hours", some "€0", some "Free"). One definition per format.
 */

const LONDON_TIME_ZONE = "Europe/London";

/** Dates arrive as `YYYY-MM-DD` or as a full ISO timestamp. */
export function parseSessionDate(value: string): Date {
  return new Date(value.includes("T") ? value : `${value}T12:00:00`);
}

/** "9 Nov" */
export function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(parseSessionDate(value));
}

/** "Mon 9 Nov at 19:30" */
export function formatRuleDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${partValue("weekday")} ${partValue("day")} ${partValue("month")} at ${partValue("hour")}:${partValue("minute")}`;
}

/** "19:30" — accepts `HH:MM`, `HH:MM:SS` or a timestamp. */
export function formatTimeOfDay(value: string): string {
  if (/^\d{1,2}:\d{2}/.test(value)) {
    return value.slice(0, 5);
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

/** "1 hour", "1 hour 30 minutes", "45 minutes". */
export function formatDuration(durationMinutes: number): string {
  const total = Math.max(0, Math.round(durationMinutes));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  if (hours === 0) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  const hourLabel = `${hours} ${hours === 1 ? "hour" : "hours"}`;

  if (minutes === 0) {
    return hourLabel;
  }

  return `${hourLabel} ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** "Free" for zero, otherwise "€5" / "€5.50". */
export function formatFee(feeCents: number): string {
  if (feeCents === 0) {
    return "Free";
  }

  if (feeCents % 100 === 0) {
    return `€${feeCents / 100}`;
  }

  return `€${(feeCents / 100).toFixed(2)}`;
}
