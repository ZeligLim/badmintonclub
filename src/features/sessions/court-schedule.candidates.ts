/**
 * Building one candidate timetable: round by round, greedily picking the court
 * groups that score best.
 */
import {
  GAME_DURATION_MINUTES,
  PLAYERS_PER_COURT,
  comparePlayerIds,
  createDeterministicRng,
  hashText,
  incrementPairCount,
  toRosterPlayer,
  type AllocatedCourtGame,
  type CourtRosterPlayer,
  type InternalPlayer,
  type ScheduleTrackingState,
} from "./court-schedule.shared";
import type { ClubSession } from "./types";
import { addMinutesToTime } from "@/lib/sessions/schedule";
import type { AnchorCycle } from "./court-schedule.select";
import {
  buildCourtGroup,
  optimizeDoublesMatchup,
  selectActivePlayers,
} from "./court-schedule.select";
import { getCourtSizes, validateSchedule } from "./court-schedule.validate";

export function allocateOnce(
  session: Pick<ClubSession, "id" | "startsAt" | "durationMinutes" | "courtCount">,
  roster: CourtRosterPlayer[],
  seedText: string = "",
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

  const deterministicSeed = `${
    session.id
  }|${roster.map((player) => player.id).sort().join(",")}|${seedText}`;
  const deterministicRng = createDeterministicRng(deterministicSeed);

  // Normalize outgoing requests. Keep requests for absent friends when
  // determining anchor eligibility/ranking; friend selection itself is
  // restricted to confirmed players in the current session. Self-requests
  // and duplicate IDs are ignored.
  //
  // The roster is canonically ordered by player id and every tie-break value
  // is derived from the player id, never from the caller's array order. Two
  // viewers loading the same session therefore build byte-identical
  // timetables, and a timetable never changes because a query returned its
  // rows in a different order.
  const orderedRoster: InternalPlayer[] = [...roster]
    .sort(comparePlayerIds)
    .map((player, index) => ({
      ...player,
      priority: player.priority ?? 0,
      friendIds: [...(player.friendIds ?? [])],
      normalizedFriendIds: [...new Set(player.friendIds ?? [])]
        .filter((id) => id !== player.id)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      rosterIndex: index,
      randomRank: hashText(`${deterministicSeed}|${player.id}`) / 0x100000000,
    }));

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
  const courtSizes = getCourtSizes(orderedRoster.length, session.courtCount);
  const activeSpotsPerRound = courtSizes.reduce((total, size) => total + size, 0);

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
    const activePlayers = selectActivePlayers(
      orderedRoster,
      activeSpotsPerRound,
      state,
      cycle,
      friendMap,
    );

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

    for (let courtIndex = 0; courtIndex < courtSizes.length; courtIndex++) {
      const group = buildCourtGroup({
        activePlayers,
        availableIds,
        cycle,
        friendMap,
        byId,
        state,
        rng: deterministicRng,
        courtSize: courtSizes[courtIndex]!,
      });

      if (group.length !== courtSizes[courtIndex]) {
        throw new Error(
          `Court ${courtIndex + 1} in round ${roundIndex + 1} has ${group.length} players; expected ${courtSizes[courtIndex]}.`,
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
        // The final court can be a three-player game when a spare court is
        // available and exactly three players remain after full courts.
        schedule.push({
          courtNumber,
          startAt,
          endAt,
          players: courtGroup.map(toRosterPlayer),
        });
      }
    }
  }

  validateSchedule(schedule, courtSizes, roundCount, uniquePlayerIds);
  return schedule;
}

