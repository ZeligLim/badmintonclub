import { addMinutesToTime } from "@/lib/sessions/schedule";
import type { ClubSession } from "./types";

const GAME_DURATION_MINUTES = 15;
const PLAYERS_PER_COURT = 4;

export type PlayerLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export type CourtRosterPlayer = {
  id: string;
  displayName: string;
  /**
   * Lower values mean higher committee priority, matching the previous
   * implementation's priority ordering.
   */
  priority?: number;
  /** One-way outgoing friendship requests. Mutual requests are not required. */
  friendIds?: string[];
  level?: PlayerLevel | null;
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
  incomingFriendCount: number;
  /** Stable random tie-break value for this schedule generation. */
  randomRank: number;
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

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function compareGameFairness(
  a: InternalPlayer,
  b: InternalPlayer,
  state: ScheduleTrackingState,
): number {
  const gamesA = state.gamesPlayed.get(a.id) ?? 0;
  const gamesB = state.gamesPlayed.get(b.id) ?? 0;
  if (gamesA !== gamesB) return gamesA - gamesB;

  const restsA = state.consecutiveRests.get(a.id) ?? 0;
  const restsB = state.consecutiveRests.get(b.id) ?? 0;
  if (restsA !== restsB) return restsB - restsA;

  const totalRestsA = state.totalRests.get(a.id) ?? 0;
  const totalRestsB = state.totalRests.get(b.id) ?? 0;
  if (totalRestsA !== totalRestsB) return totalRestsB - totalRestsA;

  return a.rosterIndex - b.rosterIndex;
}

/**
 * Anchor ranking:
 * 1. Committee priority (lower numeric priority first).
 * 2. More incoming friend requests.
 * 3. More outgoing friend requests.
 * 4. Random tie-break assigned once per schedule generation.
 */
function compareAnchorPriority(a: InternalPlayer, b: InternalPlayer): number {
  return (
    (a.priority ?? 0) - (b.priority ?? 0) ||
    b.incomingFriendCount - a.incomingFriendCount ||
    b.normalizedFriendIds.length - a.normalizedFriendIds.length ||
    a.randomRank - b.randomRank
  );
}

function toRosterPlayer(player: InternalPlayer): CourtRosterPlayer {
  return {
    id: player.id,
    displayName: player.displayName,
    priority: player.priority,
    friendIds: player.friendIds,
    level: player.level,
  };
}

type AnchorCycle = {
  eligibleAnchorIds: Set<string>;
  satisfiedAnchorIds: Set<string>;
};

/**
 * Starts a new anchor cycle only after every eligible anchor has been
 * explicitly selected as an anchor in the previous cycle.
 */
function resetAnchorCycleIfComplete(cycle: AnchorCycle): void {
  if (
    cycle.eligibleAnchorIds.size > 0 &&
    [...cycle.eligibleAnchorIds].every((id) => cycle.satisfiedAnchorIds.has(id))
  ) {
    cycle.satisfiedAnchorIds.clear();
  }
}

function hasAvailableFriend(
  player: InternalPlayer,
  availableIds: Set<string>,
  friendMap: Map<string, Set<string>>,
): boolean {
  return [...(friendMap.get(player.id) ?? [])].some((id) => availableIds.has(id));
}

/**
 * Select the highest-ranked available unsatisfied anchor.
 * If every eligible anchor has been satisfied, a new cycle begins.
 *
 * If unsatisfied anchors exist but are resting / already allocated in this
 * round, the cycle is not reset; the caller can use a fairness fallback.
 */
function getNextAnchor(
  availablePlayers: InternalPlayer[],
  cycle: AnchorCycle,
): InternalPlayer | undefined {
  resetAnchorCycleIfComplete(cycle);

  return availablePlayers
    .filter(
      (player) =>
        cycle.eligibleAnchorIds.has(player.id) &&
        !cycle.satisfiedAnchorIds.has(player.id),
    )
    .sort(compareAnchorPriority)[0];
}

function getAvailableFriends(
  anchor: InternalPlayer,
  availableIds: Set<string>,
  friendMap: Map<string, Set<string>>,
  byId: Map<string, InternalPlayer>,
): InternalPlayer[] {
  return [...(friendMap.get(anchor.id) ?? [])]
    .filter((id) => availableIds.has(id))
    .map((id) => byId.get(id))
    .filter((player): player is InternalPlayer => player !== undefined);
}

/**
 * Build one court using anchor-led friendship allocation.
 *
 * Nested-anchor behaviour:
 * - Start with a primary anchor.
 * - When one of their friends is also an unsatisfied anchor, promote that
 *   friend to a nested anchor and follow their friend list before filling
 *   with unrelated players.
 * - Continue recursively, allowing chains such as A -> B -> C -> D.
 * - After following a chain, use remaining preferences from anchors already
 *   in the group, then try another available anchor + their friend (a second
 *   two-person pair), and finally use fairness-ordered fallback players.
 *
 * An anchor is satisfied only when explicitly promoted/selected as an anchor.
 * Merely being selected as somebody else's friend does not satisfy them.
 */
function buildCourtGroup(args: {
  activePlayers: InternalPlayer[];
  availableIds: Set<string>;
  cycle: AnchorCycle;
  friendMap: Map<string, Set<string>>;
  byId: Map<string, InternalPlayer>;
  state: ScheduleTrackingState;
}): InternalPlayer[] {
  const { activePlayers, availableIds, cycle, friendMap, byId, state } = args;
  const group: InternalPlayer[] = [];
  const anchorsUsed: InternalPlayer[] = [];

  const addPlayer = (player: InternalPlayer): boolean => {
    if (group.length >= PLAYERS_PER_COURT || !availableIds.has(player.id)) return false;
    group.push(player);
    availableIds.delete(player.id);
    return true;
  };

  const promoteAnchor = (player: InternalPlayer): void => {
    if (!cycle.eligibleAnchorIds.has(player.id)) return;
    if (cycle.satisfiedAnchorIds.has(player.id)) return;
    cycle.satisfiedAnchorIds.add(player.id);
    if (!anchorsUsed.some((anchor) => anchor.id === player.id)) {
      anchorsUsed.push(player);
    }
  };

  /**
   * Follow one friendship branch deeply before returning to fill sibling
   * preferences. This makes nested chains take precedence over unrelated
   * direct friends when the court has limited spaces.
   */
  const followNestedPreferences = (anchor: InternalPlayer): void => {
    if (group.length >= PLAYERS_PER_COURT) return;

    const candidates = shuffle(
      getAvailableFriends(anchor, availableIds, friendMap, byId),
    );

    // Prefer a friend who can act as another unsatisfied anchor and has at
    // least one available friend of their own. This enables A -> B -> C -> D.
    const nestedAnchors = candidates
      .filter(
        (candidate) =>
          cycle.eligibleAnchorIds.has(candidate.id) &&
          !cycle.satisfiedAnchorIds.has(candidate.id) &&
          hasAvailableFriend(candidate, availableIds, friendMap),
      )
      .sort(compareAnchorPriority);

    const ordinaryFriends = candidates.filter(
      (candidate) => !nestedAnchors.some((nested) => nested.id === candidate.id),
    );

    const next = nestedAnchors[0] ?? ordinaryFriends[0];
    if (!next || !addPlayer(next)) return;

    if (
      cycle.eligibleAnchorIds.has(next.id) &&
      !cycle.satisfiedAnchorIds.has(next.id) &&
      hasAvailableFriend(next, availableIds, friendMap)
    ) {
      promoteAnchor(next);
      followNestedPreferences(next);
    }
  };

  // Primary anchor selection. If no unsatisfied anchor is currently
  // available, use the fairest remaining active player as a fallback.
  let primaryAnchor = getNextAnchor(
    activePlayers.filter((player) => availableIds.has(player.id)),
    cycle,
  );

  if (!primaryAnchor) {
    primaryAnchor = activePlayers
      .filter((player) => availableIds.has(player.id))
      .sort((a, b) => compareGameFairness(a, b, state))[0];
  }

  if (!primaryAnchor) return group;

  addPlayer(primaryAnchor);
  if (cycle.eligibleAnchorIds.has(primaryAnchor.id)) {
    // Being explicitly chosen as the primary anchor satisfies this anchor
    // opportunity even if all of their requested friends are unavailable.
    promoteAnchor(primaryAnchor);
  }

  // First follow a nested chain from the primary anchor.
  if (cycle.eligibleAnchorIds.has(primaryAnchor.id)) {
    followNestedPreferences(primaryAnchor);
  }

  // Fill remaining spaces using preferences from every anchor already used.
  // Iterate because a newly selected friend may itself be an anchor.
  let changed = true;
  while (group.length < PLAYERS_PER_COURT && changed) {
    changed = false;

    for (let index = 0; index < anchorsUsed.length; index++) {
      const owner = anchorsUsed[index]!;
      const candidates = shuffle(
        getAvailableFriends(owner, availableIds, friendMap, byId),
      );

      const nested = candidates
        .filter(
          (candidate) =>
            cycle.eligibleAnchorIds.has(candidate.id) &&
            !cycle.satisfiedAnchorIds.has(candidate.id) &&
            hasAvailableFriend(candidate, availableIds, friendMap),
        )
        .sort(compareAnchorPriority);

      const next = nested[0] ?? candidates[0];
      if (!next || !addPlayer(next)) continue;

      changed = true;
      if (
        cycle.eligibleAnchorIds.has(next.id) &&
        !cycle.satisfiedAnchorIds.has(next.id) &&
        hasAvailableFriend(next, availableIds, friendMap)
      ) {
        promoteAnchor(next);
        followNestedPreferences(next);
      }

      if (group.length >= PLAYERS_PER_COURT) break;
    }
  }

  // If there is room, try to combine another two-person preference pair.
  // This is the A->B plus C->D case; requests may be one-way.
  while (group.length <= PLAYERS_PER_COURT - 2) {
    const remaining = activePlayers.filter((player) => availableIds.has(player.id));
    const secondAnchor = getNextAnchor(remaining, cycle);
    if (!secondAnchor) break;

    const secondPairFriends = shuffle(
      getAvailableFriends(secondAnchor, availableIds, friendMap, byId),
    );
    if (secondPairFriends.length === 0) {
      // Do not mark this player satisfied: their own preference could not
      // be used to form a pair. They remain eligible in a later round.
      // Avoid repeatedly selecting this same anchor in this court.
      const alternatives = remaining
        .filter((player) => player.id !== secondAnchor.id)
        .sort(compareAnchorPriority);
      const alternative = alternatives.find((player) =>
        hasAvailableFriend(player, availableIds, friendMap),
      );
      if (!alternative) break;

      addPlayer(alternative);
      promoteAnchor(alternative);
      const friend = shuffle(
        getAvailableFriends(alternative, availableIds, friendMap, byId),
      )[0];
      if (friend) addPlayer(friend);
      break;
    }

    addPlayer(secondAnchor);
    promoteAnchor(secondAnchor);
    addPlayer(secondPairFriends[0]!);

    // The second anchor's preference has now contributed to this team.
    if (group.length < PLAYERS_PER_COURT) {
      followNestedPreferences(secondAnchor);
    }
  }

  // Final fallback: fill remaining places with the fairest available players.
  const fallbackPlayers = activePlayers
    .filter((player) => availableIds.has(player.id))
    .sort((a, b) => compareGameFairness(a, b, state));

  for (const player of fallbackPlayers) {
    if (group.length >= PLAYERS_PER_COURT) break;
    addPlayer(player);
  }

  return group;
}

type DoublesPairing = {
  teamA: [CourtRosterPlayer, CourtRosterPlayer];
  teamB: [CourtRosterPlayer, CourtRosterPlayer];
};

function optimizeDoublesMatchup(
  courtPlayers: InternalPlayer[],
  state: ScheduleTrackingState,
): DoublesPairing {
  const sorted = [...courtPlayers].sort((a, b) => a.id.localeCompare(b.id));
  const [p0, p1, p2, p3] = sorted;

  if (!p0 || !p1 || !p2 || !p3) {
    throw new Error("Doubles pairing requires exactly 4 players.");
  }

  const options: Array<{
    team1: [InternalPlayer, InternalPlayer];
    team2: [InternalPlayer, InternalPlayer];
  }> = [
      { team1: [p0, p1], team2: [p2, p3] },
      { team1: [p0, p2], team2: [p1, p3] },
      { team1: [p0, p3], team2: [p1, p2] },
    ];

  const score = (option: (typeof options)[number]): [number, number] => {
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
  };

  const compareScores = (a: [number, number], b: [number, number]) =>
    a[0] - b[0] || a[1] - b[1];

  let best = options[0]!;
  let bestScore = score(best);

  for (const option of options.slice(1)) {
    const optionScore = score(option);
    if (compareScores(optionScore, bestScore) < 0) {
      best = option;
      bestScore = optionScore;
    }
  }

  const team1 = [...best.team1].sort((a, b) => a.id.localeCompare(b.id));
  const team2 = [...best.team2].sort((a, b) => a.id.localeCompare(b.id));

  const firstTeamComesFirst = team1[0]!.id.localeCompare(team2[0]!.id) < 0;
  const first = firstTeamComesFirst ? team1 : team2;
  const second = firstTeamComesFirst ? team2 : team1;

  return {
    teamA: [toRosterPlayer(first[0]!), toRosterPlayer(first[1]!)],
    teamB: [toRosterPlayer(second[0]!), toRosterPlayer(second[1]!)],
  };
}

function incrementPairCount(
  map: Map<string, Map<string, number>>,
  firstId: string,
  secondId: string,
): void {
  const inner = map.get(firstId)!;
  inner.set(secondId, (inner.get(secondId) ?? 0) + 1);
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

  const rosterIds = new Set(roster.map((player) => player.id));
  const incomingCounts = new Map<string, number>(roster.map((player) => [player.id, 0]));

  for (const player of roster) {
    for (const friendId of new Set(player.friendIds ?? [])) {
      if (friendId !== player.id && rosterIds.has(friendId)) {
        incomingCounts.set(friendId, (incomingCounts.get(friendId) ?? 0) + 1);
      }
    }
  }

  // Normalize outgoing requests. Keep requests for absent friends when
  // determining anchor eligibility/ranking; friend selection itself is
  // restricted to confirmed players in the current session. Self-requests
  // and duplicate IDs are ignored.
  const orderedRoster: InternalPlayer[] = roster
    .map((player, index) => ({
      ...player,
      priority: player.priority ?? 0,
      friendIds: [...(player.friendIds ?? [])],
      normalizedFriendIds: [
        ...new Set(player.friendIds ?? []),
      ].filter((id) => id !== player.id),
      incomingFriendCount: incomingCounts.get(player.id) ?? 0,
      rosterIndex: index,
      randomRank: Math.random(),
    }))
    .sort((a, b) => a.rosterIndex - b.rosterIndex);

  const byId = new Map(orderedRoster.map((player) => [player.id, player]));
  const friendMap = new Map(
    orderedRoster.map((player) => [
      player.id,
      new Set(player.normalizedFriendIds),
    ]),
  );

  // Eligible means the player has at least one outgoing request. A requested
  // friend who is absent from this session cannot be selected, but their
  // request still makes the requester eligible for an anchor opportunity.
  const eligibleAnchorIds = new Set(
    orderedRoster
      .filter((player) => player.normalizedFriendIds.length > 0)
      .map((player) => player.id),
  );

  const cycle: AnchorCycle = {
    eligibleAnchorIds,
    satisfiedAnchorIds: new Set<string>(),
  };

  const roundCount = Math.ceil(session.durationMinutes / GAME_DURATION_MINUTES);
  const activeCourtCount =
    orderedRoster.length < PLAYERS_PER_COURT
      ? 1
      : Math.min(
        session.courtCount,
        Math.floor(orderedRoster.length / PLAYERS_PER_COURT),
      );
  const playersPerCourt =
    orderedRoster.length < PLAYERS_PER_COURT
      ? orderedRoster.length
      : PLAYERS_PER_COURT;
  const activeSpotsPerRound = activeCourtCount * playersPerCourt;

  const state: ScheduleTrackingState = {
    gamesPlayed: new Map(orderedRoster.map((player) => [player.id, 0])),
    consecutiveRests: new Map(orderedRoster.map((player) => [player.id, 0])),
    totalRests: new Map(orderedRoster.map((player) => [player.id, 0])),
    lastPlayedRound: new Map(orderedRoster.map((player) => [player.id, -1])),
    physicalCourtAssignments: new Map(
      orderedRoster.map((player) => [player.id, new Map<number, number>()]),
    ),
    courtCoPresence: new Map(
      orderedRoster.map((player) => [player.id, new Map<string, number>()]),
    ),
    doublesPartnerships: new Map(
      orderedRoster.map((player) => [player.id, new Map<string, number>()]),
    ),
    doublesOpponents: new Map(
      orderedRoster.map((player) => [player.id, new Map<string, number>()]),
    ),
  };

  const schedule: AllocatedCourtGame[] = [];

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex++) {
    // HARD FAIRNESS RULE:
    // Select players with the fewest games first. Among equal game counts,
    // prefer the longest consecutive rest, then the greatest total rest.
    const activePlayers = [...orderedRoster]
      .sort((a, b) => compareGameFairness(a, b, state))
      .slice(0, activeSpotsPerRound);

    const activeSet = new Set(activePlayers.map((player) => player.id));

    for (const player of orderedRoster) {
      if (activeSet.has(player.id)) {
        state.gamesPlayed.set(
          player.id,
          (state.gamesPlayed.get(player.id) ?? 0) + 1,
        );
        state.consecutiveRests.set(player.id, 0);
        state.lastPlayedRound.set(player.id, roundIndex);
      } else {
        state.consecutiveRests.set(
          player.id,
          (state.consecutiveRests.get(player.id) ?? 0) + 1,
        );
        state.totalRests.set(
          player.id,
          (state.totalRests.get(player.id) ?? 0) + 1,
        );
      }
    }

    // Friendship-led team construction, while keeping each active player
    // available for no more than one court in this round.
    const availableIds = new Set(activePlayers.map((player) => player.id));
    const courtGroups: InternalPlayer[][] = [];

    for (let courtIndex = 0; courtIndex < activeCourtCount; courtIndex++) {
      const group = buildCourtGroup({
        activePlayers,
        availableIds,
        cycle,
        friendMap,
        byId,
        state,
      });

      if (group.length !== playersPerCourt) {
        throw new Error(
          `Court ${courtIndex + 1} in round ${roundIndex + 1} has ${group.length} players; expected ${playersPerCourt}.`,
        );
      }

      courtGroups.push(group);
    }

    const startOffset = roundIndex * GAME_DURATION_MINUTES;
    const startAt = addMinutesToTime(session.startsAt, startOffset);
    const endAt = addMinutesToTime(
      session.startsAt,
      Math.min(startOffset + GAME_DURATION_MINUTES, session.durationMinutes),
    );

    for (let courtIndex = 0; courtIndex < courtGroups.length; courtIndex++) {
      const courtNumber = courtIndex + 1;
      const courtGroup = courtGroups[courtIndex]!;

      for (let i = 0; i < courtGroup.length; i++) {
        const player = courtGroup[i]!;
        const courtAssignments = state.physicalCourtAssignments.get(player.id)!;
        courtAssignments.set(
          courtNumber,
          (courtAssignments.get(courtNumber) ?? 0) + 1,
        );

        for (let j = i + 1; j < courtGroup.length; j++) {
          const other = courtGroup[j]!;
          incrementPairCount(state.courtCoPresence, player.id, other.id);
          incrementPairCount(state.courtCoPresence, other.id, player.id);
        }
      }

      if (courtGroup.length === PLAYERS_PER_COURT) {
        const { teamA, teamB } = optimizeDoublesMatchup(courtGroup, state);
        const [a1, a2] = teamA;
        const [b1, b2] = teamB;

        incrementPairCount(state.doublesPartnerships, a1.id, a2.id);
        incrementPairCount(state.doublesPartnerships, a2.id, a1.id);
        incrementPairCount(state.doublesPartnerships, b1.id, b2.id);
        incrementPairCount(state.doublesPartnerships, b2.id, b1.id);

        for (const playerA of teamA) {
          for (const playerB of teamB) {
            incrementPairCount(state.doublesOpponents, playerA.id, playerB.id);
            incrementPairCount(state.doublesOpponents, playerB.id, playerA.id);
          }
        }

        schedule.push({
          courtNumber,
          startAt,
          endAt,
          teamA,
          teamB,
          players: [...teamA, ...teamB],
        });
      } else {
        // A partial court is only possible when the entire roster has < 4.
        schedule.push({
          courtNumber,
          startAt,
          endAt,
          players: courtGroup.map(toRosterPlayer),
        });
      }
    }
  }

  validateSchedule(schedule, activeCourtCount * roundCount, orderedRoster.length);
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

function validateSchedule(
  games: AllocatedCourtGame[],
  expectedGameCount: number,
  rosterSize: number,
): void {
  if (games.length !== expectedGameCount) {
    throw new Error(
      `Court allocation produced ${games.length} games; expected ${expectedGameCount}.`,
    );
  }

  const expectedPerGame = Math.min(PLAYERS_PER_COURT, rosterSize);
  for (const game of games) {
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
  }
}
