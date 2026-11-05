"use client";

import { useEffect, useState } from "react";

/**
 * A clock anchored to the club's time.
 *
 * The absolute time comes from the server render; the browser only measures how
 * long the page has been open. A device with a wrong clock therefore cannot move
 * a sign-up window, and the countdown still ticks without a request per minute.
 */
export function useServerClock(serverNow: string): Date | null {
  const [anchoredAt] = useState(() => Date.now());
  const base = Date.parse(serverNow);
  const [currentTime, setCurrentTime] = useState<Date | null>(() =>
    Number.isFinite(base) ? new Date(base) : null,
  );

  useEffect(() => {
    if (!Number.isFinite(base)) {
      return;
    }

    const update = () => setCurrentTime(new Date(base + (Date.now() - anchoredAt)));
    update();
    const intervalId = setInterval(update, 30_000);
    return () => clearInterval(intervalId);
  }, [anchoredAt, base]);

  return currentTime;
}
