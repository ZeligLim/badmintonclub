/**
 * Playing-level scoring, kept apart from the allocation search so the rules are
 * readable in one place.
 */

export type PlayerLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "PROFESSIONAL";

export const LEVEL_VALUE: Record<PlayerLevel, number> = {
  BEGINNER: 1,
  INTERMEDIATE: 2,
  ADVANCED: 3,
  PROFESSIONAL: 4,
};

/** Reads a stored level, falling back to the club default for unknown text. */
export function toPlayerLevel(value: string | null | undefined): PlayerLevel {
  if (value === "BEGINNER" || value === "INTERMEDIATE") return value;
  if (value === "ADVANCED" || value === "PROFESSIONAL") return value;
  return "INTERMEDIATE";
}

export function levelValue(level: PlayerLevel | string | null | undefined): number {
  if (level === "BEGINNER") return LEVEL_VALUE.BEGINNER;
  if (level === "INTERMEDIATE") return LEVEL_VALUE.INTERMEDIATE;
  if (level === "ADVANCED") return LEVEL_VALUE.ADVANCED;
  if (level === "PROFESSIONAL") return LEVEL_VALUE.PROFESSIONAL;
  return LEVEL_VALUE.INTERMEDIATE;
}

/** Higher levels rank first when every fairness and friendship tie is equal. */
export function compareLevelRank(
  a: { level?: PlayerLevel | null },
  b: { level?: PlayerLevel | null },
): number {
  return levelValue(b.level) - levelValue(a.level);
}

/**
 * How mixed a court is, as a rankable penalty. The club prefers, in order:
 * all the same level, two and two, three stronger with one weaker,
 * two plus two different, three weaker with one stronger, four different.
 * Level distance inside a class is a tie-break, not a stronger rule.
 */
export function levelCompositionPenalty(
  players: Array<{ level?: PlayerLevel | null }>,
): number {
  const counts = new Map<number, number>();
  for (const player of players) {
    const value = levelValue(player.level);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const groups = [...counts.values()].sort((a, b) => b - a);

  if (groups.length === 1) return 0;
  if (players.length === 4) {
    if (groups[0] === 2 && groups[1] === 2) return 10;
    if (groups[0] === 3) {
      const [[strongLevel], [singleLevel]] = [...counts.entries()].sort(
        (a, b) => b[1] - a[1],
      );
      // Three stronger with one weaker is fine; three weaker with one
      // stronger strands the strongest player.
      return singleLevel > strongLevel ? 40 : 20;
    }
    if (groups[0] === 1) return 50;
    return 30;
  }
  if (players.length === 3) {
    if (groups[0] === 2) return 25;
    return 50;
  }
  return levelSpreadWithin(players) * 10;
}

/** Total level spread inside a group, used only to break ties inside a class. */
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
