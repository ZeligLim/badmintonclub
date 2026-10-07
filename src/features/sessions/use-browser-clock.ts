"use client";

import { useEffect, useState } from "react";

export function useBrowserClock(): Date | null {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(new Date());
    updateCurrentTime();

    const intervalId = setInterval(updateCurrentTime, 60_000);
    return () => clearInterval(intervalId);
  }, []);

  return currentTime;
}
