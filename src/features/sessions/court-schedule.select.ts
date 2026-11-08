/**
 * Deciding who plays in each court group: anchors, friend packs and doubles
 * pairings.
 */
import {
  PLAYERS_PER_COURT,
  compareAnchorPriority,
  compareGameFairness,
  compareGameFairnessPriority,
  comparePlayerIds,
  countFriendEdgesBetween,
  shuffle,
  toRosterPlayer,
  type InternalPlayer,
  type ScheduleTrackingState,
  type CourtRosterPlayer,
} from "./court-schedule.shared";
import { levelSpreadWithin, levelValue } from "./court-schedule.levels";

export type AnchorCycle = {
  eligibleAnchorIds: Set<string>;
  satisfiedAnchorIds: Set<string>;
};

export type DoublesPairing = {
  teamA: [CourtRosterPlayer, CourtRosterPlayer];
  teamB: [CourtRosterPlayer, CourtRosterPlayer];
};

/**
 * Select active players by the hard fairness ranking first. When players are
 * tied on games and rest, choose a friend-connected group before using roster
 * order so friend requests can actually be matched on court.
 */
export function selectActivePlayers(
  roster: InternalPlayer[],
  count: number,
  state: ScheduleTrackingState,
  cycle: AnchorCycle,
  friendMap: Map<string, Set<string>>,
): InternalPlayer[] {
  const active: InternalPlayer[] = [];
  const remaining = [...roster];

  while (active.length < count && remaining.length > 0) {
    remaining.sort((a, b) => compareGameFairnessPriority(a, b, state));
    const bestFairness = remaining[0]!;
    const tied = remaining.filter(
      (player) => compareGameFairnessPriority(player, bestFairness, state) === 0,
    );

    const score = (candidate: InternalPlayer): number => {
      const others = active.length > 0
        ? active
        : tied.filter((player) => player.id !== candidate.id);
      return others.reduce(
        (total, other) =>
          total + countFriendEdgesBetween(candidate.id, other.id, friendMap),
        0,
      );
    };

    const selected = [...tied].sort(
      (a, b) =>
        score(b) - score(a) ||
        (cycle.eligibleAnchorIds.has(b.id) ? 1 : 0) -
          (cycle.eligibleAnchorIds.has(a.id) ? 1 : 0) ||
        compareAnchorPriority(a, b),
    )[0]!;
    active.push(selected);
    remaining.splice(remaining.findIndex((player) => player.id === selected.id), 1);
  }

  // Treat each committee member and their requested / nested friends as one
  // court pack. If a full pack cannot fit without breaking game fairness or
  // another committee pack, the committee member rests this round.
  const byId = new Map(roster.map((player) => [player.id, player]));
  const rosterIds = new Set(roster.map((player) => player.id));
  const activeIds = new Set(active.map((player) => player.id));
  const committeePacks = roster
    .filter((player) => player.isCommittee && player.normalizedFriendIds.length > 0)
    .map((player) => ({
      committee: player,
      ids: new Set([
        player.id,
        ...getCommitteeCourtCompanions(player, rosterIds, friendMap, byId, state).map(
          (friend) => friend.id,
        ),
      ]),
    }))
    .sort((a, b) => compareAnchorPriority(a.committee, b.committee));
  const protectedIds = new Set(committeePacks.flatMap((pack) => [...pack.ids]));
  const reservedGroups: Set<string>[] = [];

  const fairnessAfterSwap = (playingIds: Set<string>, removeId: string, addId: string) => {
    const nextCounts = roster.map((player) =>
      (state.gamesPlayed.get(player.id) ?? 0) +
      Number(playingIds.has(player.id) && player.id !== removeId) +
      Number(player.id === addId),
    );
    return Math.max(...nextCounts) - Math.min(...nextCounts) <= 1;
  };

  for (const pack of committeePacks) {
    if (!activeIds.has(pack.committee.id)) continue;
    const overlappingGroups = reservedGroups.filter((group) =>
      [...pack.ids].some((id) => group.has(id)),
    );
    const mergedGroup = new Set([
      ...pack.ids,
      ...overlappingGroups.flatMap((group) => [...group]),
    ]);
    const reservedIds = new Set(reservedGroups.flatMap((group) => [...group]));
    let trialPlayers = [...active];
    const trialIds = new Set(activeIds);
    let feasible =
      pack.ids.size > 1 &&
      (overlappingGroups.length === 0 || mergedGroup.size <= PLAYERS_PER_COURT);

    for (const friendId of pack.ids) {
      if (!feasible || trialIds.has(friendId)) continue;
      const friend = byId.get(friendId);
      if (!friend) {
        feasible = false;
        break;
      }

      const replacements = trialPlayers
        .filter(
          (player) =>
            !pack.ids.has(player.id) &&
            !reservedIds.has(player.id) &&
            !protectedIds.has(player.id),
        )
        .sort(
          (a, b) =>
            Number(a.isCommittee) - Number(b.isCommittee) ||
            Number(a.normalizedFriendIds.length > 0) -
              Number(b.normalizedFriendIds.length > 0) ||
            compareGameFairnessPriority(b, a, state),
        );
      const replacement = replacements.find((player) =>
        fairnessAfterSwap(trialIds, player.id, friendId),
      );
      if (!replacement) {
        feasible = false;
        break;
      }

      trialPlayers = trialPlayers.filter((player) => player.id !== replacement.id);
      trialPlayers.push(friend);
      trialIds.delete(replacement.id);
      trialIds.add(friendId);
    }

    if (!feasible) {
      const committee = pack.committee;
      const replacement = roster
        .filter((player) => !activeIds.has(player.id) && !reservedIds.has(player.id))
        .sort(
          (a, b) =>
            Number(a.isCommittee) - Number(b.isCommittee) ||
            compareGameFairness(a, b, state),
        )
        .find((player) => fairnessAfterSwap(activeIds, committee.id, player.id));
      if (replacement) {
        const index = active.findIndex((player) => player.id === committee.id);
        if (index >= 0) active[index] = replacement;
        activeIds.delete(committee.id);
        activeIds.add(replacement.id);
      } else {
        // Keep the fair active roster when the committee pack cannot be
        // completed or rotated out without creating a game-count gap. The
        // court builder still gives this committee's available friends
        // priority, and an infeasible preference pack must not abort the
        // entire session schedule.
        continue;
      }
      continue;
    }

    active.splice(0, active.length, ...trialPlayers);
    activeIds.clear();
    for (const id of trialIds) activeIds.add(id);
    for (const group of overlappingGroups) {
      reservedGroups.splice(reservedGroups.indexOf(group), 1);
    }
    reservedGroups.push(mergedGroup);
  }

  return active;
}

/**
 * Starts a new anchor cycle only after every eligible anchor has been
 * explicitly selected as an anchor in the previous cycle.
 */
export function resetAnchorCycleIfComplete(cycle: AnchorCycle): void {
  if (
    cycle.eligibleAnchorIds.size > 0 &&
    [...cycle.eligibleAnchorIds].every((id) => cycle.satisfiedAnchorIds.has(id))
  ) {
    cycle.satisfiedAnchorIds.clear();
  }
}

export function hasAvailableFriend(
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
export function getNextAnchor(
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

export function getAvailableFriends(
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

export function getCommitteeCourtCompanions(
  committee: InternalPlayer,
  availableIds: Set<string>,
  friendMap: Map<string, Set<string>>,
  byId: Map<string, InternalPlayer>,
  state: ScheduleTrackingState,
  courtSize = PLAYERS_PER_COURT,
): InternalPlayer[] {
  const directFriends = getAvailableFriends(
    committee,
    availableIds,
    friendMap,
    byId,
  ).sort(
    (a, b) =>
      // Prefer friends who also requested the committee member: those pairs
      // create two satisfied requests instead of one. Rotate the remaining
      // friends so a larger friend group still gets its turn across rounds.
      Number(b.normalizedFriendIds.includes(committee.id)) -
        Number(a.normalizedFriendIds.includes(committee.id)) ||
      (state.courtCoPresence.get(committee.id)?.get(a.id) ?? 0) -
        (state.courtCoPresence.get(committee.id)?.get(b.id) ?? 0) ||
      a.randomRank - b.randomRank,
  );
  const allDirectRequestsSeen = [...(friendMap.get(committee.id) ?? [])]
    .filter((id) => byId.has(id))
    .every((id) => (state.courtCoPresence.get(committee.id)?.get(id) ?? 0) > 0);
  const directFriendIds = new Set(friendMap.get(committee.id) ?? []);
  const nestedFriends = directFriends
    .flatMap((friend) =>
      getAvailableFriends(friend, availableIds, friendMap, byId).map((player) => ({
        owner: friend,
        player,
      })),
    )
    .filter(({ player }) => player.id !== committee.id && !directFriendIds.has(player.id))
    .filter(
      (candidate, index, candidates) =>
        candidates.findIndex(({ player }) => player.id === candidate.player.id) === index,
    )
    .sort(
      (a, b) =>
        (state.courtCoPresence.get(committee.id)?.get(a.player.id) ?? 0) -
        (state.courtCoPresence.get(committee.id)?.get(b.player.id) ?? 0) ||
        (state.courtCoPresence.get(a.owner.id)?.get(a.player.id) ?? 0) -
        (state.courtCoPresence.get(b.owner.id)?.get(b.player.id) ?? 0) ||
        a.player.randomRank - b.player.randomRank,
    );

  const reserveNestedPlace = allDirectRequestsSeen && nestedFriends.length > 0;
  const directLimit = Math.min(
    directFriends.length,
    courtSize - 1 - Number(reserveNestedPlace),
  );
  const companions = directFriends.slice(0, directLimit);
  if (reserveNestedPlace && nestedFriends[0]) companions.push(nestedFriends[0].player);

  for (const candidate of nestedFriends) {
    if (companions.length >= courtSize - 1) break;
    if (!companions.some((player) => player.id === candidate.player.id)) {
      companions.push(candidate.player);
    }
  }

  return companions;
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
export function buildCourtGroup(args: {
  activePlayers: InternalPlayer[];
  availableIds: Set<string>;
  cycle: AnchorCycle;
  friendMap: Map<string, Set<string>>;
  byId: Map<string, InternalPlayer>;
  state: ScheduleTrackingState;
  rng: () => number;
  courtSize: number;
}): InternalPlayer[] {
  const { activePlayers, availableIds, cycle, friendMap, byId, state, rng, courtSize } = args;
  const group: InternalPlayer[] = [];
  const anchorsUsed: InternalPlayer[] = [];

  const addPlayer = (player: InternalPlayer): boolean => {
    if (group.length >= courtSize || !availableIds.has(player.id)) return false;
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
    if (group.length >= courtSize) return;

    const candidates = shuffle(
      getAvailableFriends(anchor, availableIds, friendMap, byId),
      rng,
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
  const availablePlayers = activePlayers.filter((player) => availableIds.has(player.id));
  let primaryAnchor = availablePlayers
    .filter((player) => player.isCommittee && player.normalizedFriendIds.length > 0)
    .sort(compareAnchorPriority)[0] ?? getNextAnchor(availablePlayers, cycle);

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

  // Committee anchors get the available requested friends onto their court
  // together as one complete group. Direct requests are covered first, then
  // nested friends use any remaining place.
  if (primaryAnchor.isCommittee) {
    const companions = getCommitteeCourtCompanions(
      primaryAnchor,
      availableIds,
      friendMap,
      byId,
      state,
      courtSize,
    );
    for (const companion of companions) {
      addPlayer(companion);
      if (
        cycle.eligibleAnchorIds.has(companion.id) &&
        !cycle.satisfiedAnchorIds.has(companion.id) &&
        hasAvailableFriend(companion, availableIds, friendMap)
      ) {
        promoteAnchor(companion);
      }
    }

    // A committee pack can be smaller than the court only if no more direct
    // or nested requests are available among the active players.
    if (group.length < courtSize) {
      for (const friend of group.slice(1)) {
        if (!cycle.eligibleAnchorIds.has(friend.id)) continue;
        followNestedPreferences(friend);
        if (group.length >= courtSize) break;
      }
    }
  } else if (cycle.eligibleAnchorIds.has(primaryAnchor.id)) {
    // For other anchors, follow a nested friendship chain before filling the
    // remaining places.
    followNestedPreferences(primaryAnchor);
  }

  // Fill remaining spaces using preferences from every anchor already used.
  // Iterate because a newly selected friend may itself be an anchor.
  let changed = true;
  while (group.length < courtSize && changed) {
    changed = false;

    for (let index = 0; index < anchorsUsed.length; index++) {
      const owner = anchorsUsed[index]!;
      const candidates = shuffle(
        getAvailableFriends(owner, availableIds, friendMap, byId),
        rng,
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

      if (group.length >= courtSize) break;
    }
  }

  // If there is room, try to combine another two-person preference pair.
  // This is the A->B plus C->D case; requests may be one-way.
  while (group.length <= courtSize - 2) {
    const remaining = activePlayers.filter((player) => availableIds.has(player.id));
    const secondAnchor = getNextAnchor(remaining, cycle);
    if (!secondAnchor) break;

    const secondPairFriends = shuffle(
      getAvailableFriends(secondAnchor, availableIds, friendMap, byId),
      rng,
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
        rng,
      )[0];
      if (friend) addPlayer(friend);
      break;
    }

    addPlayer(secondAnchor);
    promoteAnchor(secondAnchor);
    addPlayer(secondPairFriends[0]!);

    // The second anchor's preference has now contributed to this team.
    if (group.length < courtSize) {
      followNestedPreferences(secondAnchor);
    }
  }

  // Final fallback: fill remaining places with the fairest available players.
  // Preserve players with outgoing requests for later anchor opportunities;
  // players who did not request a friend are the first choice as fillers.
  const fallbackPlayers = activePlayers
    .filter((player) => availableIds.has(player.id))
    .sort(
      (a, b) =>
        group.reduce(
          (total, other) => total + countFriendEdgesBetween(b.id, other.id, friendMap),
          0,
        ) -
          group.reduce(
            (total, other) => total + countFriendEdgesBetween(a.id, other.id, friendMap),
            0,
          ) ||
        Number(a.normalizedFriendIds.length > 0) -
          Number(b.normalizedFriendIds.length > 0) ||
        levelSpreadWithin([...group, a]) - levelSpreadWithin([...group, b]) ||
        compareGameFairness(a, b, state),
    );

  for (const player of fallbackPlayers) {
    if (group.length >= courtSize) break;
    addPlayer(player);
  }

  return group;
}

export function optimizeDoublesMatchup(
  courtPlayers: InternalPlayer[],
  state: ScheduleTrackingState,
): DoublesPairing {
  const sorted = [...courtPlayers].sort(comparePlayerIds);
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

  const score = (option: (typeof options)[number]): [number, number, number] => {
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

    // After avoiding repeat partnerships and opponents, split the teams so
    // both sides have a similar playing level.
    const levelImbalance = Math.abs(
      levelValue(a.level) + levelValue(b.level) -
        (levelValue(c.level) + levelValue(d.level)),
    );

    return [partnerRepeats, opponentRepeats, levelImbalance];
  };

  const compareScores = (a: number[], b: number[]) =>
    a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;

  let best = options[0]!;
  let bestScore = score(best);

  for (const option of options.slice(1)) {
    const optionScore = score(option);
    if (compareScores(optionScore, bestScore) < 0) {
      best = option;
      bestScore = optionScore;
    }
  }

  const team1 = [...best.team1].sort(comparePlayerIds);
  const team2 = [...best.team2].sort(comparePlayerIds);

  const firstTeamComesFirst = comparePlayerIds(team1[0]!, team2[0]!) < 0;
  const first = firstTeamComesFirst ? team1 : team2;
  const second = firstTeamComesFirst ? team2 : team1;

  return {
    teamA: [toRosterPlayer(first[0]!), toRosterPlayer(first[1]!)],
    teamB: [toRosterPlayer(second[0]!), toRosterPlayer(second[1]!)],
  };
}
