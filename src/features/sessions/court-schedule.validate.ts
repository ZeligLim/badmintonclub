/**
 * Checking a finished timetable before it is returned.
 */
import { PLAYERS_PER_COURT, type AllocatedCourtGame } from "./court-schedule.shared";

export function getCourtSizes(rosterSize: number, courtCount: number): number[] {
  if (rosterSize < PLAYERS_PER_COURT) return [rosterSize];

  const fullCourtCount = Math.min(courtCount, Math.floor(rosterSize / PLAYERS_PER_COURT));
  const sizes = Array.from({ length: fullCourtCount }, () => PLAYERS_PER_COURT);
  const remainingPlayers = rosterSize - fullCourtCount * PLAYERS_PER_COURT;

  // Use a free court for the three-player game when exactly three players
  // remain after filling every full doubles court.
  if (sizes.length < courtCount && remainingPlayers === 3) sizes.push(3);

  return sizes;
}

export function validateSchedule(
  games: AllocatedCourtGame[],
  courtSizes: number[],
  expectedRounds: number,
  rosterIds?: Set<string>,
): void {
  const expectedGameCount = expectedRounds * courtSizes.length;
  if (games.length !== expectedGameCount) {
    throw new Error(
      `Court allocation produced ${games.length} games; expected ${expectedGameCount}.`,
    );
  }

  const playersByStart = new Map<string, Set<string>>();

  for (const game of games) {
    const expectedPerGame = courtSizes[game.courtNumber - 1];
    if (game.players.length !== expectedPerGame) {
      throw new Error(
        `Court ${game.courtNumber} at ${game.startAt} has ${game.players.length} players; expected ${expectedPerGame}.`,
      );
    }

    if (new Set(game.players.map((player) => player.id)).size !== game.players.length) {
      throw new Error(
        `Court ${game.courtNumber} at ${game.startAt} contains a duplicate player.`,
      );
    }

    const roundPlayers = playersByStart.get(game.startAt) ?? new Set<string>();
    for (const player of game.players) {
      if (rosterIds && !rosterIds.has(player.id)) {
        throw new Error(`${player.id} is not in the confirmed roster.`);
      }
      if (roundPlayers.has(player.id)) {
        throw new Error(
          `${player.id} is allocated to more than one court at ${game.startAt}.`,
        );
      }
      roundPlayers.add(player.id);
    }
    playersByStart.set(game.startAt, roundPlayers);
  }
}
