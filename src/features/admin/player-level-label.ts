import type { PlayerLevel } from "@/types/player";

export function playerLevelLabel(level: PlayerLevel): string {
  return level.charAt(0) + level.slice(1).toLowerCase();
}
