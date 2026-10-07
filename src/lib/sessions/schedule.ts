export const CLUB_TIME_ZONE = "Europe/London";

export type ClubSessionDay = "Monday" | "Wednesday";

export type NextWeekSchedule = {
  monday: string;
  wednesday: string;
  signupOpensAt: string;
};

export function getNextWeekSchedule(now = new Date()): NextWeekSchedule {
  const today = getLondonDate(now);
  const [year, month, day] = today.split("-").map(Number);
  const todayUtc = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (todayUtc.getUTCDay() + 6) % 7;
  const nextMonday = addDays(todayUtc, 7 - daysSinceMonday);
  const wednesday = addDays(nextMonday, 2);

  return {
    monday: formatDate(nextMonday),
    wednesday: formatDate(wednesday),
    signupOpensAt: londonDateTime(addDays(nextMonday, -4), 0, 0),
  };
}

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
  return weekday === 1 ? "Monday" : "Wednesday";
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [hour, minute] = time.split(":").map(Number);
  const totalMinutes = hour * 60 + minute + minutes;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function getLondonDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
