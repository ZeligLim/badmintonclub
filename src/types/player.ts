export type PlayerLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "PROFESSIONAL";

/** Every level the database may store, most advanced first. */
export const PLAYER_LEVELS = [
  "PROFESSIONAL",
  "ADVANCED",
  "INTERMEDIATE",
  "BEGINNER",
] as const satisfies readonly PlayerLevel[];

/** Levels a member may pick for themselves; professional stays invitation-only. */
export const SELECTABLE_PLAYER_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const satisfies readonly PlayerLevel[];
