import { addMinutesToTime } from "@/lib/sessions/schedule";
import type { ClubSession } from "./types";

const GAME_DURATION_MINUTES = 15;
const PLAYERS_PER_COURT = 4;

export type CourtRosterPlayer = {
  id: string;
  displayName: string;
  priority?: number;
};

export type AllocatedCourtGame = {
  courtNumber: number;
  startAt: string;
  endAt: string;
  players: CourtRosterPlayer[];
};

export function getCourtCount(capacity: number): number {
  return Math.min(Math.ceil(capacity / 8), 4);
}

export type PlayerGame = {
  courtNumber: number;
  startAt: string;
  endAt: string;
};

export function allocateCourtSchedule(
  session: Pick<ClubSession, "id" | "startsAt" | "durationMinutes" | "courtCount">,
  roster: CourtRosterPlayer[],
): AllocatedCourtGame[] {
  if (!Number.isInteger(session.durationMinutes) || session.durationMinutes <= 0) {
    throw new Error("Court allocation requires a positive whole-number session duration.");
  }
  if (!Number.isInteger(session.courtCount) || session.courtCount <= 0) {
    throw new Error("Court allocation requires at least one court.");
  }
  if (roster.length === 0) {
    throw new Error("Court allocation requires at least one confirmed player.");
  }

  const uniquePlayerIds = new Set(roster.map((player) => player.id));
  if (uniquePlayerIds.size !== roster.length) {
    throw new Error("Court allocation roster contains duplicate player IDs.");
  }

  const orderedRoster = [...roster].sort(
    (left, right) =>
      (left.priority ?? 0) - (right.priority ?? 0) ||
      left.id.localeCompare(right.id),
  );
  const random = createSeededRandom(
    `${session.id}:${orderedRoster.map((player) => player.id).join(",")}`,
  );
  for (let index = orderedRoster.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [orderedRoster[index], orderedRoster[swapIndex]] = [
      orderedRoster[swapIndex],
      orderedRoster[index],
    ];
  }

  const roundCount = Math.ceil(
    session.durationMinutes / GAME_DURATION_MINUTES,
  );
  const activeCourtCount =
    orderedRoster.length < PLAYERS_PER_COURT ? 1 : session.courtCount;
  const gamesPlayed = new Map(orderedRoster.map(({ id }) => [id, 0]));
  const lastPlayedRound = new Map(orderedRoster.map(({ id }) => [id, -1]));
  const schedule: AllocatedCourtGame[] = [];

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const usedThisRound = new Set<string>();
    const roundGames: AllocatedCourtGame[] = [];

    for (let courtNumber = 1; courtNumber <= activeCourtCount; courtNumber += 1) {
      const players: CourtRosterPlayer[] = [];

      const playersPerGame = Math.min(PLAYERS_PER_COURT, orderedRoster.length);
      while (players.length < playersPerGame) {
        let candidates = orderedRoster.filter(
          (player) => !usedThisRound.has(player.id),
        );
        if (candidates.length === 0) {
          usedThisRound.clear();
          candidates = orderedRoster;
        }

        const notOnThisCourt = candidates.filter(
          (candidate) => !players.some((player) => player.id === candidate.id),
        );
        if (notOnThisCourt.length > 0) {
          candidates = notOnThisCourt;
        }

        candidates.sort(
          (left, right) =>
            gamesPlayed.get(left.id)! - gamesPlayed.get(right.id)! ||
            lastPlayedRound.get(left.id)! - lastPlayedRound.get(right.id)! ||
            orderedRoster.indexOf(left) - orderedRoster.indexOf(right),
        );

        const selectedPlayer = candidates[0];
        if (!selectedPlayer) {
          throw new Error("Court allocation could not fill a court.");
        }

        players.push(selectedPlayer);
        usedThisRound.add(selectedPlayer.id);
        gamesPlayed.set(
          selectedPlayer.id,
          gamesPlayed.get(selectedPlayer.id)! + 1,
        );
        lastPlayedRound.set(selectedPlayer.id, roundIndex);
      }

      const startOffset = roundIndex * GAME_DURATION_MINUTES;
      roundGames.push({
        courtNumber,
        startAt: addMinutesToTime(session.startsAt, startOffset),
        endAt: addMinutesToTime(
          session.startsAt,
          Math.min(startOffset + GAME_DURATION_MINUTES, session.durationMinutes),
        ),
        players,
      });
    }

    validateRound(roundGames, activeCourtCount, orderedRoster.length);
    schedule.push(...roundGames);
  }

  if (schedule.length !== roundCount * activeCourtCount) {
    throw new Error("Court allocation produced an incomplete session schedule.");
  }

  return schedule;
}

export function createPlayerGameSchedule(
  session: Pick<ClubSession, "id" | "durationMinutes" | "courtCount" | "startsAt">,
  roster: CourtRosterPlayer[],
  playerId: string,
): PlayerGame[] {
  return allocateCourtSchedule(session, roster)
    .filter((game) => game.players.some((player) => player.id === playerId))
    .map(({ courtNumber, startAt, endAt }) => ({
      courtNumber,
      startAt,
      endAt,
    }));
}

function validateRound(
  games: AllocatedCourtGame[],
  expectedCourtCount: number,
  rosterSize: number,
): void {
  if (games.length !== expectedCourtCount) {
    throw new Error("Court allocation produced an incomplete timeslot.");
  }
  for (const game of games) {
    if (game.players.length !== Math.min(PLAYERS_PER_COURT, rosterSize)) {
      throw new Error(
        `Court ${game.courtNumber} at ${game.startAt} has ${game.players.length} players; expected ${PLAYERS_PER_COURT}.`,
      );
    }
  }
}

function createSeededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const character of seed) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  }

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
