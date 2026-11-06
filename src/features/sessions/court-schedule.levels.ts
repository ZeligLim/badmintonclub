/**
 * Playing-level scoring, kept apart from the allocation search so the rules are
 * readable in one place.
 */

export type PlayerLevel = "BEGINNER" | "INTERMEDIATE" | "PROFESSIONAL";

export const LEVEL_VALUE: Record<PlayerLevel, number> = {
  BEGINNER: 1,
  INTERMEDIATE: 2,
  PROFESSIONAL: 3,
};

export function levelValue(
  level: PlayerLevel | null | undefined,
): number {
  // Rows written before the level migration can still carry a value outside
  // PlayerLevel (for example "ADVANCED"); treat anything unknown as the
  // default rather than letting NaN leak into every score comparison.
  return (level ? LEVEL_VALUE[level] : undefined) ?? LEVEL_VALUE.INTERMEDIATE;
}

/** Higher levels rank first when every fairness and friendship tie is equal. */
export function compareLevelRank(
  a: { level?: PlayerLevel | null },
  b: { level?: PlayerLevel | null },
): number {
  return levelValue(b.level) - levelValue(a.level);
}

/**
 * Total level spread inside a group. Courts with a smaller spread keep
 * professionals, intermediates and beginners together where the club can.
 */
export function levelSpreadWithin(
  players: Array<{ level?: PlayerLevel | null }>,
): number {
  let spread = 0;
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      spread += Math.abs(
        levelValue(players[i]!.level) - levelValue(players[j]!.level),
      );
    }
  }
  return spread;
}
