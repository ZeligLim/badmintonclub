import { addMinutesToTime } from "@/lib/sessions/schedule";
import type { ClubSession } from "./types";

const GAME_DURATION_MINUTES = 15;

export type PlayerGame = {
  courtNumber: number;
  startAt: string;
  endAt: string;
};

export function createPlayerGameSchedule(
  session: Pick<ClubSession, "durationMinutes" | "courtCount" | "startsAt">,
  playerGroupNumber: number,
  playerGroupCount: number,
): PlayerGame[] {
  const roundCount = Math.ceil(
    session.durationMinutes / GAME_DURATION_MINUTES,
  );
  const activeCourtCount = Math.min(session.courtCount, playerGroupCount);
  const gamesPlayed = Array.from({ length: playerGroupCount }, () => 0);
  const lastPlayedRounds = Array.from({ length: playerGroupCount }, () => -1);
  const schedule: PlayerGame[] = [];

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const activeGroups = Array.from(
      { length: playerGroupCount },
      (_, groupIndex) => groupIndex + 1,
    )
      .sort(
        (leftGroup, rightGroup) =>
          gamesPlayed[leftGroup - 1] - gamesPlayed[rightGroup - 1] ||
          lastPlayedRounds[leftGroup - 1] -
            lastPlayedRounds[rightGroup - 1],
      )
      .slice(0, activeCourtCount);
    const occupiedCourts = new Set<number>();

    for (const groupNumber of activeGroups) {
      const groupIndex = groupNumber - 1;
      let courtNumber =
        ((groupIndex + gamesPlayed[groupIndex]) % session.courtCount) + 1;

      while (occupiedCourts.has(courtNumber)) {
        courtNumber = (courtNumber % session.courtCount) + 1;
      }
      occupiedCourts.add(courtNumber);

      if (groupNumber === playerGroupNumber) {
        const startOffset = roundIndex * GAME_DURATION_MINUTES;
        const endOffset = Math.min(
          startOffset + GAME_DURATION_MINUTES,
          session.durationMinutes,
        );
        schedule.push({
          courtNumber,
          startAt: addMinutesToTime(session.startsAt, startOffset),
          endAt: addMinutesToTime(session.startsAt, endOffset),
        });
      }

      gamesPlayed[groupIndex] += 1;
      lastPlayedRounds[groupIndex] = roundIndex;
    }
  }

  return schedule;
}
