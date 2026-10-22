export const CLUB_TIME_ZONE = "Europe/London";

export const CLUB_SESSION_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type ClubSessionDay = (typeof CLUB_SESSION_DAYS)[number];

export function londonDateTime(date: Date, hour: number, minute: number): string {
  const desiredLocalTime = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hour,
    minute,
  );
  let utcTime = desiredLocalTime;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const localParts = getLondonDateTimeParts(new Date(utcTime));
    const observedLocalTime = Date.UTC(
      localParts.year,
      localParts.month - 1,
      localParts.day,
      localParts.hour,
      localParts.minute,
    );
    utcTime += desiredLocalTime - observedLocalTime;
  }

  return new Date(utcTime).toISOString();
}

export function getSessionDayName(date: string): ClubSessionDay {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return CLUB_SESSION_DAYS[(weekday + 6) % 7];
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [hour, minute] = time.split(":").map(Number);
  const totalMinutes = hour * 60 + minute + minutes;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function getLondonDateTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}
