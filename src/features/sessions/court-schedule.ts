import { addMinutesToTime } from "@/lib/sessions/schedule";
import type { ClubSession } from "./types";

const GAME_DURATION_MINUTES = 15;
const PLAYERS_PER_COURT = 4;

export type CourtRosterPlayer = {
  id: string;
  displayName: string;
  priority?: number;
  friendIds?: string[];
};

export type AllocatedCourtGame = {
  courtNumber: number;
  startAt: string;
  endAt: string;
  players: CourtRosterPlayer[];
  teamA?: [CourtRosterPlayer, CourtRosterPlayer];
  teamB?: [CourtRosterPlayer, CourtRosterPlayer];
};

export function getCourtCount(capacity: number): number {
  return Math.min(Math.ceil(capacity / 8), 4);
}

export type PlayerGame = {
  courtNumber: number;
  startAt: string;
  endAt: string;
  courtPlayers: string[];
};

type InternalPlayer = CourtRosterPlayer & {
  rosterIndex: number;
  normalizedFriendIds: string[];
};

export type ScheduleTrackingState = {
  gamesPlayed: Map<string, number>;
  consecutiveRests: Map<string, number>;
  totalRests: Map<string, number>;
  lastPlayedRound: Map<string, number>;
  physicalCourtAssignments: Map<string, Map<number, number>>;
  courtCoPresence: Map<string, Map<string, number>>;
  doublesPartnerships: Map<string, Map<string, number>>;
  doublesOpponents: Map<string, Map<string, number>>;
};

// Seeded PRNG (Mulberry32) for deterministic Fisher-Yates shuffles
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  const rng = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

// Stage 1: Deterministic selection priority comparator
// Primary: gamesPlayed (asc) - hard fairness invariant
// Secondary: consecutiveRests (desc) - rest priority
// Tertiary: totalRests (desc) - overall rest balance
// Quaternary: rosterIndex (asc) - deterministic tie-break
function compareSelectionPriority(
  a: InternalPlayer,
  b: InternalPlayer,
  state: ScheduleTrackingState,
): number {
  const gamesA = state.gamesPlayed.get(a.id) ?? 0;
  const gamesB = state.gamesPlayed.get(b.id) ?? 0;
  if (gamesA !== gamesB) return gamesA - gamesB;

  const restA = state.consecutiveRests.get(a.id) ?? 0;
  const restB = state.consecutiveRests.get(b.id) ?? 0;
  if (restA !== restB) return restB - restA;

  const totRestA = state.totalRests.get(a.id) ?? 0;
  const totRestB = state.totalRests.get(b.id) ?? 0;
  if (totRestA !== totRestB) return totRestB - totRestA;

  return a.rosterIndex - b.rosterIndex;
}

// Partition evaluation: tuple of [negSatisfiedEdges, coPresence, physicalCourtRepeats]
type PartitionScore = [number, number, number];

function comparePartitionScores(a: PartitionScore, b: PartitionScore): number {
  if (a[0] !== b[0]) return a[0] - b[0]; // more friends satisfied (lower negative number)
  if (a[1] !== b[1]) return a[1] - b[1]; // fewer co-presence repeats
  return a[2] - b[2]; // fewer physical court repeats
}

function evaluatePartition(
  partition: InternalPlayer[][],
  friendMap: Map<string, Set<string>>,
  state: ScheduleTrackingState,
): PartitionScore {
  let negFriends = 0;
  let coPresence = 0;
  let courtRepeats = 0;

  for (let c = 0; c < partition.length; c++) {
    const courtGroup = partition[c]!;
    const courtNumber = c + 1;

    for (let i = 0; i < courtGroup.length; i++) {
      const u = courtGroup[i]!;
      courtRepeats += state.physicalCourtAssignments.get(u.id)?.get(courtNumber) ?? 0;
      const uFriends = friendMap.get(u.id);

      for (let j = 0; j < courtGroup.length; j++) {
        if (i === j) continue;
        const v = courtGroup[j]!;
        if (uFriends?.has(v.id)) {
          negFriends -= 1;
        }
        if (i < j) {
          coPresence += state.courtCoPresence.get(u.id)?.get(v.id) ?? 0;
        }
      }
    }
  }

  return [negFriends, coPresence, courtRepeats];
}

function getPartitionCanonicalKey(partition: InternalPlayer[][]): string {
  return partition
    .map((court) =>
      court
        .map((p) => p.id)
        .sort()
        .join(","),
    )
    .sort()
    .join("|");
}

// Exact exhaustive search for small sessions (C <= 2, active <= 8)
function exhaustivePartition(
  players: InternalPlayer[],
  courtCount: number,
  friendMap: Map<string, Set<string>>,
  state: ScheduleTrackingState,
): InternalPlayer[][] {
  if (courtCount === 1) {
    return [players];
  }

  // Generate all C(players.length, 4) combinations for Court 1
  function combinations(arr: InternalPlayer[], k: number): InternalPlayer[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const head = arr[0]!;
    const tail = arr.slice(1);
    const withHead = combinations(tail, k - 1).map((c) => [head, ...c]);
    const withoutHead = combinations(tail, k);
    return [...withHead, ...withoutHead];
  }

  const allCourt1 = combinations(players, PLAYERS_PER_COURT);
  let bestPartition: InternalPlayer[][] | null = null;
  let bestScore: PartitionScore = [Infinity, Infinity, Infinity];
  let bestKey = "";

  const seenKeys = new Set<string>();

  for (const c1 of allCourt1) {
    const c1Set = new Set(c1.map((p) => p.id));
    const c2 = players.filter((p) => !c1Set.has(p.id));

    // Normalize canonical key to eliminate court symmetry
    const partition = [c1, c2];
    const key = getPartitionCanonicalKey(partition);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const score = evaluatePartition(partition, friendMap, state);
    const cmp = comparePartitionScores(score, bestScore);
    if (cmp < 0 || (cmp === 0 && (bestKey === "" || key.localeCompare(bestKey) < 0))) {
      bestScore = score;
      bestPartition = partition;
      bestKey = key;
    }
  }

  return bestPartition ?? [players.slice(0, 4), players.slice(4, 8)];
}

// Multi-start 2-opt local search with full cross-court evaluation for C > 2
function multiStart2OptPartition(
  players: InternalPlayer[],
  courtCount: number,
  friendMap: Map<string, Set<string>>,
  state: ScheduleTrackingState,
): InternalPlayer[][] {
  let bestPartition: InternalPlayer[][] | null = null;
  let bestScore: PartitionScore = [Infinity, Infinity, Infinity];
  let bestKey = "";

  const NUM_RESTARTS = 5;

  for (let restart = 0; restart < NUM_RESTARTS; restart++) {
    let initialPermutation: InternalPlayer[];

    if (restart === 0) {
      // Restart 0: Friend-degree descending sort, tie-broken by rosterIndex
      initialPermutation = [...players].sort((a, b) => {
        const degA = a.normalizedFriendIds.filter((fid) => players.some((p) => p.id === fid)).length;
        const degB = b.normalizedFriendIds.filter((fid) => players.some((p) => p.id === fid)).length;
        if (degA !== degB) return degB - degA;
        return a.rosterIndex - b.rosterIndex;
      });
    } else {
      // Restarts 1..4: Seeded deterministic Fisher-Yates shuffle
      initialPermutation = seededShuffle(players, restart * 1000 + 42);
    }

    // Chunk into court groups of 4
    const currentPartition: InternalPlayer[][] = [];
    for (let c = 0; c < courtCount; c++) {
      currentPartition.push(initialPermutation.slice(c * 4, c * 4 + 4));
    }

    let currentScore = evaluatePartition(currentPartition, friendMap, state);
    let improved = true;
    let iteration = 0;

    // Evaluate all cross-court 2-player swaps until local minimum
    while (improved && iteration < 30) {
      improved = false;
      iteration += 1;

      for (let c1 = 0; c1 < courtCount; c1++) {
        for (let c2 = c1 + 1; c2 < courtCount; c2++) {
          const group1 = currentPartition[c1]!;
          const group2 = currentPartition[c2]!;

          for (let i = 0; i < group1.length; i++) {
            for (let j = 0; j < group2.length; j++) {
              // Swap player group1[i] and group2[j]
              const temp = group1[i]!;
              group1[i] = group2[j]!;
              group2[j] = temp;

              const candidateScore = evaluatePartition(currentPartition, friendMap, state);

              // Accept swap if and only if the complete lexicographical objective strictly improves
              if (comparePartitionScores(candidateScore, currentScore) < 0) {
                currentScore = candidateScore;
                improved = true;
              } else {
                // Revert swap
                group2[j] = group1[i]!;
                group1[i] = temp;
              }
            }
          }
        }
      }
    }

    const currentKey = getPartitionCanonicalKey(currentPartition);
    const cmp = comparePartitionScores(currentScore, bestScore);
    if (cmp < 0 || (cmp === 0 && (bestKey === "" || currentKey.localeCompare(bestKey) < 0))) {
      bestScore = currentScore;
      bestPartition = currentPartition.map((court) => [...court]);
      bestKey = currentKey;
    }
  }

  return bestPartition!;
}

// Stage 3: Optimize doubles 2v2 pairing within an assigned 4-player court
type DoublesPairing = {
  teamA: [CourtRosterPlayer, CourtRosterPlayer];
  teamB: [CourtRosterPlayer, CourtRosterPlayer];
};

function optimizeDoublesMatchup(
  courtPlayers: InternalPlayer[],
  state: ScheduleTrackingState,
): DoublesPairing {
  // Sort players alphabetically by ID for deterministic pairing evaluation
  const sorted = [...courtPlayers].sort((a, b) => a.id.localeCompare(b.id));
  const [p0, p1, p2, p3] = sorted;

  if (!p0 || !p1 || !p2 || !p3) {
    throw new Error("Doubles pairing requires exactly 4 players.");
  }

  const options: Array<{ team1: [InternalPlayer, InternalPlayer]; team2: [InternalPlayer, InternalPlayer] }> = [
    { team1: [p0, p1], team2: [p2, p3] },
    { team1: [p0, p2], team2: [p1, p3] },
    { team1: [p0, p3], team2: [p1, p2] },
  ];

  type MatchupScore = [number, number];

  function evaluateMatchup(option: (typeof options)[number]): MatchupScore {
    const [a, b] = option.team1;
    const [c, d] = option.team2;

    const partnerRepeats =
      (state.doublesPartnerships.get(a.id)?.get(b.id) ?? 0) +
      (state.doublesPartnerships.get(c.id)?.get(d.id) ?? 0);

    const opponentRepeats =
      (state.doublesOpponents.get(a.id)?.get(c.id) ?? 0) +
      (state.doublesOpponents.get(a.id)?.get(d.id) ?? 0) +
      (state.doublesOpponents.get(b.id)?.get(c.id) ?? 0) +
      (state.doublesOpponents.get(b.id)?.get(d.id) ?? 0);

    return [partnerRepeats, opponentRepeats];
  }

  function compareMatchups(a: MatchupScore, b: MatchupScore): number {
    if (a[0] !== b[0]) return a[0] - b[0]; // fewer partnership repeats
    return a[1] - b[1]; // fewer opponent repeats
  }

  let bestOption = options[0]!;
  let bestScore = evaluateMatchup(options[0]!);

  for (let i = 1; i < options.length; i++) {
    const option = options[i]!;
    const score = evaluateMatchup(option);
    if (compareMatchups(score, bestScore) < 0) {
      bestScore = score;
      bestOption = option;
    }
  }

  // Canonicalize team ordering:
  // Sort players within each team alphabetically
  const team1Sorted = [...bestOption.team1].sort((a, b) => a.id.localeCompare(b.id)) as [InternalPlayer, InternalPlayer];
  const team2Sorted = [...bestOption.team2].sort((a, b) => a.id.localeCompare(b.id)) as [InternalPlayer, InternalPlayer];

  // Team with alphabetically smaller first player is teamA
  let teamA: [CourtRosterPlayer, CourtRosterPlayer];
  let teamB: [CourtRosterPlayer, CourtRosterPlayer];
  if (team1Sorted[0].id.localeCompare(team2Sorted[0].id) < 0) {
    teamA = [
      {
        id: team1Sorted[0].id,
        displayName: team1Sorted[0].displayName,
        priority: team1Sorted[0].priority,
        friendIds: team1Sorted[0].friendIds,
      },
      {
        id: team1Sorted[1].id,
        displayName: team1Sorted[1].displayName,
        priority: team1Sorted[1].priority,
        friendIds: team1Sorted[1].friendIds,
      },
    ];
    teamB = [
      {
        id: team2Sorted[0].id,
        displayName: team2Sorted[0].displayName,
        priority: team2Sorted[0].priority,
        friendIds: team2Sorted[0].friendIds,
      },
      {
        id: team2Sorted[1].id,
        displayName: team2Sorted[1].displayName,
        priority: team2Sorted[1].priority,
        friendIds: team2Sorted[1].friendIds,
      },
    ];
  } else {
    teamA = [
      {
        id: team2Sorted[0].id,
        displayName: team2Sorted[0].displayName,
        priority: team2Sorted[0].priority,
        friendIds: team2Sorted[0].friendIds,
      },
      {
        id: team2Sorted[1].id,
        displayName: team2Sorted[1].displayName,
        priority: team2Sorted[1].priority,
        friendIds: team2Sorted[1].friendIds,
      },
    ];
    teamB = [
      {
        id: team1Sorted[0].id,
        displayName: team1Sorted[0].displayName,
        priority: team1Sorted[0].priority,
        friendIds: team1Sorted[0].friendIds,
      },
      {
        id: team1Sorted[1].id,
        displayName: team1Sorted[1].displayName,
        priority: team1Sorted[1].priority,
        friendIds: team1Sorted[1].friendIds,
      },
    ];
  }

  return { teamA, teamB };
}

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

  // Input normalization for 100% deterministic processing
  const orderedRoster: InternalPlayer[] = [...roster]
    .map((player) => ({
      ...player,
      priority: player.priority ?? 0,
      normalizedFriendIds: [...(player.friendIds ?? [])].sort(),
    }))
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.id.localeCompare(b.id),
    )
    .map((player, index) => ({
      ...player,
      rosterIndex: index,
    }));

  const roundCount = Math.ceil(
    session.durationMinutes / GAME_DURATION_MINUTES,
  );

  // Doubles court capacity rule:
  // Each doubles court must have exactly 4 players.
  // Active courts cannot exceed available players divided by 4.
  // If roster size < 4 (tiny roster), allow 1 partial court with all players.
  const activeCourtCount =
    orderedRoster.length < PLAYERS_PER_COURT
      ? 1
      : Math.min(session.courtCount, Math.floor(orderedRoster.length / PLAYERS_PER_COURT));
  const playersPerCourt = orderedRoster.length < PLAYERS_PER_COURT ? orderedRoster.length : PLAYERS_PER_COURT;
  const activeSpotsPerRound = activeCourtCount * playersPerCourt;

  // Initialize tracking state
  const state: ScheduleTrackingState = {
    gamesPlayed: new Map(orderedRoster.map((p) => [p.id, 0])),
    consecutiveRests: new Map(orderedRoster.map((p) => [p.id, 0])),
    totalRests: new Map(orderedRoster.map((p) => [p.id, 0])),
    lastPlayedRound: new Map(orderedRoster.map((p) => [p.id, -1])),
    physicalCourtAssignments: new Map(orderedRoster.map((p) => [p.id, new Map()])),
    courtCoPresence: new Map(orderedRoster.map((p) => [p.id, new Map()])),
    doublesPartnerships: new Map(orderedRoster.map((p) => [p.id, new Map()])),
    doublesOpponents: new Map(orderedRoster.map((p) => [p.id, new Map()])),
  };

  const friendMap = new Map<string, Set<string>>(
    orderedRoster.map((p) => [p.id, new Set(p.normalizedFriendIds)]),
  );

  const schedule: AllocatedCourtGame[] = [];

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex++) {
    // Stage 1: Priority-based selection
    const sortedCandidates = [...orderedRoster].sort((a, b) =>
      compareSelectionPriority(a, b, state),
    );
    const activePlayers = sortedCandidates.slice(0, activeSpotsPerRound);
    const activeSet = new Set(activePlayers.map((p) => p.id));

    // Update rest and play tracking
    for (const player of orderedRoster) {
      if (activeSet.has(player.id)) {
        state.gamesPlayed.set(player.id, (state.gamesPlayed.get(player.id) ?? 0) + 1);
        state.consecutiveRests.set(player.id, 0);
        state.lastPlayedRound.set(player.id, roundIndex);
      } else {
        state.consecutiveRests.set(player.id, (state.consecutiveRests.get(player.id) ?? 0) + 1);
        state.totalRests.set(player.id, (state.totalRests.get(player.id) ?? 0) + 1);
      }
    }

    // Stage 2: Court Partitioning
    let courtPartitions: InternalPlayer[][];
    if (activeCourtCount <= 2) {
      courtPartitions = exhaustivePartition(activePlayers, activeCourtCount, friendMap, state);
    } else {
      courtPartitions = multiStart2OptPartition(activePlayers, activeCourtCount, friendMap, state);
    }

    const startOffset = roundIndex * GAME_DURATION_MINUTES;
    const startAt = addMinutesToTime(session.startsAt, startOffset);
    const endAt = addMinutesToTime(
      session.startsAt,
      Math.min(startOffset + GAME_DURATION_MINUTES, session.durationMinutes),
    );

    // Stage 3: Doubles Matchup within Court
    for (let c = 0; c < courtPartitions.length; c++) {
      const courtNumber = c + 1;
      const courtGroup = courtPartitions[c]!;

      // Update physical court assignments and court co-presence
      for (let i = 0; i < courtGroup.length; i++) {
        const u = courtGroup[i]!;
        const courtMap = state.physicalCourtAssignments.get(u.id)!;
        courtMap.set(courtNumber, (courtMap.get(courtNumber) ?? 0) + 1);

        for (let j = i + 1; j < courtGroup.length; j++) {
          const v = courtGroup[j]!;
          const coPMapU = state.courtCoPresence.get(u.id)!;
          coPMapU.set(v.id, (coPMapU.get(v.id) ?? 0) + 1);
          const coPMapV = state.courtCoPresence.get(v.id)!;
          coPMapV.set(u.id, (coPMapV.get(u.id) ?? 0) + 1);
        }
      }

      if (courtGroup.length === PLAYERS_PER_COURT) {
        const { teamA, teamB } = optimizeDoublesMatchup(courtGroup, state);

        // Update partnerships
        const [a1, a2] = teamA;
        const [b1, b2] = teamB;
        state.doublesPartnerships.get(a1.id)!.set(a2.id, (state.doublesPartnerships.get(a1.id)!.get(a2.id) ?? 0) + 1);
        state.doublesPartnerships.get(a2.id)!.set(a1.id, (state.doublesPartnerships.get(a2.id)!.get(a1.id) ?? 0) + 1);
        state.doublesPartnerships.get(b1.id)!.set(b2.id, (state.doublesPartnerships.get(b1.id)!.get(b2.id) ?? 0) + 1);
        state.doublesPartnerships.get(b2.id)!.set(b1.id, (state.doublesPartnerships.get(b2.id)!.get(b1.id) ?? 0) + 1);

        // Update opponents
        for (const playerA of teamA) {
          for (const playerB of teamB) {
            state.doublesOpponents.get(playerA.id)!.set(playerB.id, (state.doublesOpponents.get(playerA.id)!.get(playerB.id) ?? 0) + 1);
            state.doublesOpponents.get(playerB.id)!.set(playerA.id, (state.doublesOpponents.get(playerB.id)!.get(playerA.id) ?? 0) + 1);
          }
        }

        schedule.push({
          courtNumber,
          startAt,
          endAt,
          teamA,
          teamB,
          players: [teamA[0], teamA[1], teamB[0], teamB[1]],
        });
      } else {
        // Small roster partial court (< 4 players)
        schedule.push({
          courtNumber,
          startAt,
          endAt,
          players: courtGroup.map((p) => ({ id: p.id, displayName: p.displayName, priority: p.priority })),
        });
      }
    }
  }

  validateRound(schedule, activeCourtCount * roundCount, orderedRoster.length);

  return schedule;
}

export function createPlayerGameSchedule(
  session: Pick<ClubSession, "id" | "durationMinutes" | "courtCount" | "startsAt">,
  roster: CourtRosterPlayer[],
  playerId: string,
): PlayerGame[] {
  return allocateCourtSchedule(session, roster)
    .filter((game) => game.players.some((player) => player.id === playerId))
    .map(({ courtNumber, startAt, endAt, players }) => ({
      courtNumber,
      startAt,
      endAt,
      courtPlayers: players
        .filter((player) => player.id !== playerId)
        .map((player) => player.displayName),
    }));
}

function validateRound(
  games: AllocatedCourtGame[],
  expectedGameCount: number,
  rosterSize: number,
): void {
  if (games.length !== expectedGameCount) {
    throw new Error(`Court allocation produced ${games.length} games; expected ${expectedGameCount}.`);
  }
  const expectedPerGame = Math.min(PLAYERS_PER_COURT, rosterSize);
  for (const game of games) {
    if (game.players.length !== expectedPerGame) {
      throw new Error(
        `Court ${game.courtNumber} at ${game.startAt} has ${game.players.length} players; expected ${expectedPerGame}.`,
      );
    }
  }
}
