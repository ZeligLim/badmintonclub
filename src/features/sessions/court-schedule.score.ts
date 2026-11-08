/**
 * Scoring a whole candidate timetable so the best one can be kept.
 */
import type { ClubSession } from "./types";
import {
  GAME_DURATION_MINUTES,
  type AllocatedCourtGame,
  type CourtRosterPlayer,
} from "./court-schedule.shared";
import { levelSpreadWithin } from "./court-schedule.levels";
import { getCourtSizes } from "./court-schedule.validate";

export function compareScore(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return left - right;
  }
  return 0;
}

export function scoreAllocation(
  session: Pick<ClubSession, "id" | "durationMinutes" | "courtCount">,
  roster: CourtRosterPlayer[],
  schedule: AllocatedCourtGame[],
): number[] {
  const rosterIds = new Set(roster.map((player) => player.id));
  const rosterById = new Map(roster.map((player) => [player.id, player]));
  const normalizedFriends = new Map(
    roster.map((player) => [
      player.id,
      new Set((player.friendIds ?? []).filter((id) => id !== player.id && rosterIds.has(id))),
    ]),
  );

  let hardViolations = 0;
  const expectedRounds = Math.ceil(session.durationMinutes / GAME_DURATION_MINUTES);
  const expectedCourtSizes = getCourtSizes(roster.length, session.courtCount);
  const expectedCourtsPerRound = expectedCourtSizes.length;

  if (schedule.length !== expectedRounds * expectedCourtsPerRound) {
    hardViolations += Math.abs(schedule.length - expectedRounds * expectedCourtsPerRound) + 1;
  }

  const seenPlayersByRound = new Map<number, Set<string>>();
  const roundByStart = new Map<string, number>();
  for (const game of schedule) {
    if (game.players.length !== expectedCourtSizes[game.courtNumber - 1]) {
      hardViolations += 1;
    }
    if (new Set(game.players.map((player) => player.id)).size !== game.players.length) {
      hardViolations += 1;
    }
    for (const player of game.players) {
      if (!rosterIds.has(player.id)) hardViolations += 1;
    }

    const round = roundByStart.get(game.startAt) ?? roundByStart.size;
    if (!roundByStart.has(game.startAt)) roundByStart.set(game.startAt, round);
    const seen = seenPlayersByRound.get(round) ?? new Set<string>();
    for (const player of game.players) {
      if (seen.has(player.id)) hardViolations += 1;
      seen.add(player.id);
    }
    seenPlayersByRound.set(round, seen);
  }

  const gameCounts = new Map<string, number>(roster.map((player) => [player.id, 0]));
  for (const game of schedule) {
    for (const player of game.players) {
      gameCounts.set(player.id, (gameCounts.get(player.id) ?? 0) + 1);
    }
  }
  const counts = [...gameCounts.values()];
  const maxGames = Math.max(...counts, 0);
  const minGames = Math.min(...counts, Number.POSITIVE_INFINITY);
  const fairnessViolation = Number.isFinite(minGames) ? maxGames - minGames : 0;

  const fulfilledUnique = new Set<string>();
  const committeeWeighted = { count: 0 };
  const committeeNestedUnique = new Set<string>();
  let committeeDirectOccurrences = 0;
  let committeeNestedOccurrences = 0;
  let occurrences = 0;
  let levelGap = 0;
  const courtPairOccurrences = new Map<string, number>();
  const doublesPairOccurrences = new Map<string, number>();

  for (const game of schedule) {
    const playerIdsInGame = game.players.map((player) => player.id);
    const playerSet = new Set(playerIdsInGame);
    levelGap += levelSpreadWithin(
      game.players.map((player) => rosterById.get(player.id) ?? player),
    );
    for (const playerId of playerIdsInGame) {
      for (const friendId of normalizedFriends.get(playerId) ?? []) {
        if (!playerSet.has(friendId)) continue;
        const key = `${playerId}->${friendId}`;
        if (!fulfilledUnique.has(key)) {
          fulfilledUnique.add(key);
          if (rosterById.get(playerId)?.isCommittee) {
            committeeWeighted.count += 1;
          }
        }
        occurrences += 1;

        if (rosterById.get(playerId)?.isCommittee) {
          committeeDirectOccurrences += 1;
          for (const nestedFriendId of normalizedFriends.get(friendId) ?? []) {
            if (!playerSet.has(nestedFriendId) || nestedFriendId === playerId) continue;
            committeeNestedOccurrences += 1;
            committeeNestedUnique.add(`${playerId}->${friendId}->${nestedFriendId}`);
          }
        }
      }
    }

    // Each directed request should be counted once per game, not once per
    // unordered pair. occurrences currently counts once per requesting player
    // in this game, which is the desired round occurrence.
    for (let i = 0; i < playerIdsInGame.length; i += 1) {
      for (let j = i + 1; j < playerIdsInGame.length; j += 1) {
        const pairKey = [playerIdsInGame[i], playerIdsInGame[j]].sort().join("|");
        const count = (courtPairOccurrences.get(pairKey) ?? 0) + 1;
        courtPairOccurrences.set(pairKey, count);
      }
    }

    if (game.teamA && game.teamB) {
      const pairs = [
        `${game.teamA[0].id}|${game.teamA[1].id}`,
        `${game.teamB[0].id}|${game.teamB[1].id}`,
      ];
      for (const pair of pairs) {
        doublesPairOccurrences.set(
          pair,
          (doublesPairOccurrences.get(pair) ?? 0) + 1,
        );
      }
    }
  }

  let repeatedCourtPairs = 0;
  for (const count of courtPairOccurrences.values()) {
    if (count > 1) repeatedCourtPairs += count - 1;
  }

  let repeatedDoubles = 0;
  for (const count of doublesPairOccurrences.values()) {
    if (count > 1) repeatedDoubles += (count - 1) * (count - 1);
  }

  const uniqueCount = fulfilledUnique.size;
  const occurrenceCount = occurrences;

  return [
    hardViolations,
    fairnessViolation,
    -committeeWeighted.count,
    -committeeNestedUnique.size,
    -committeeDirectOccurrences,
    -committeeNestedOccurrences,
    -uniqueCount,
    -occurrenceCount,
    levelGap,
    repeatedCourtPairs + repeatedDoubles,
  ];
}
