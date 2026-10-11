import { allocateCourtSchedule } from "./court-schedule";
import type { AdminCourtGame, AdminPlayer } from "../admin/data";

export function buildDemoCourtSchedule(
  sessionId: string,
  startsAt: string,
  durationMinutes: number,
  courtCount: number,
  selectedPlayers: AdminPlayer[],
): AdminCourtGame[] {
  if (!selectedPlayers.length) return [];

  return allocateCourtSchedule(
    { id: sessionId, startsAt, durationMinutes, courtCount },
    selectedPlayers.map((player) => ({
      id: player.userId,
      displayName: player.displayName,
      priority: player.slotNumber ?? 1,
    })),
  ).map((game) => ({
    ...game,
    players: game.players.map(({ displayName }) => displayName),
  }));
}
