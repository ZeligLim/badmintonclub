import { addMinutesToTime } from "@/lib/sessions/schedule";
import type { AdminCourtGame, AdminPlayer } from "../admin/data";

const GAME_DURATION_MINUTES = 15;

export function buildDemoCourtSchedule(
  startsAt: string,
  durationMinutes: number,
  courtCount: number,
  selectedPlayers: AdminPlayer[],
): AdminCourtGame[] {
  if (!selectedPlayers.length) return [];

  const slotNumbers = [
    ...new Set(selectedPlayers.map((p) => p.slotNumber ?? 1)),
  ].sort((a, b) => a - b);

  const groups = slotNumbers.map((slot) =>
    selectedPlayers
      .filter((p) => p.slotNumber === slot)
      .map((p) => p.displayName),
  );

  const groupCount = groups.length;
  const activeCourtCount = Math.min(courtCount, groupCount);
  const roundCount = Math.ceil(durationMinutes / GAME_DURATION_MINUTES);

  const gamesPlayed = Array.from({ length: groupCount }, () => 0);
  const lastPlayedRound = Array.from({ length: groupCount }, () => -1);
  const schedule: AdminCourtGame[] = [];

  for (let round = 0; round < roundCount; round++) {
    const activeGroupIndices = Array.from({ length: groupCount }, (_, i) => i)
      .sort(
        (a, b) =>
          gamesPlayed[a] - gamesPlayed[b] ||
          lastPlayedRound[a] - lastPlayedRound[b],
      )
      .slice(0, activeCourtCount);

    const occupiedCourts = new Set<number>();

    for (const groupIdx of activeGroupIndices) {
      let court = ((groupIdx + gamesPlayed[groupIdx]) % courtCount) + 1;
      while (occupiedCourts.has(court)) {
        court = (court % courtCount) + 1;
      }
      occupiedCourts.add(court);

      const startOffset = round * GAME_DURATION_MINUTES;
      const endOffset = Math.min(
        startOffset + GAME_DURATION_MINUTES,
        durationMinutes,
      );

      schedule.push({
        courtNumber: court,
        startAt: addMinutesToTime(startsAt, startOffset),
        endAt: addMinutesToTime(startsAt, endOffset),
        players: groups[groupIdx],
      });

      gamesPlayed[groupIdx]++;
      lastPlayedRound[groupIdx] = round;
    }
  }

  schedule.sort(
    (a, b) =>
      a.startAt.localeCompare(b.startAt) || a.courtNumber - b.courtNumber,
  );

  return schedule;
}
