# Court allocation pseudo-code

This is a readable outline of `src/features/sessions/court-schedule.ts`. The
implementation is the source of truth; see `docs/court-allocation.md` for the
rules and the immutability policy.

```text
allocateCourtSchedule(session, roster, options):
    fail if roster is empty or has duplicate player ids
    fail if duration or court count is invalid

    # The same inputs must always produce the same timetable, whatever order
    # the database returned the rows in.
    canonicalRoster = sort roster by player id
    for each player:
        friendIds = sorted unique outgoing requests, excluding self
        randomRank = hash(session.id + "|" + player.id)
    friendMap = player id -> set of friend ids
    eligibleAnchors = players with at least one outgoing request

    best = null
    for candidateIndex in 0 .. candidateCount - 1:
        schedule = allocateOnce(session, canonicalRoster, seed(candidateIndex))
        score = scoreAllocation(schedule)
        keep the schedule with the lowest score

    validate best
    return best


allocateOnce(session, roster):
    state = games played, rest, co-presence, partnerships, opponents
    anchorCycle = eligible anchors, satisfied anchors = {}
    courtSizes = full four-player courts, plus one three-player court for a
                 remainder of exactly three when a court is free
    activeSpots = sum(courtSizes)

    for each 15-minute round:
        active = selectActivePlayers(activeSpots)   # hard fairness first
            - sort by fewest games
            - then longest current rest
            - then greatest total rest
            - between exact fairness ties: friend connection, anchor status,
              level, stable tie-break, player id
            - keep committee friend packs together when fairness allows

        update games played and rest counters

        for each court:
            group = buildCourtGroup(active, available, anchorCycle)
            record court, doubles teams, co-presence, partnerships, opponents

        append games for the round

    validate every round is disjoint and every court has the expected size


buildCourtGroup(active, available, anchorCycle, courtSize):
    group = []

    primary = highest-ranked available unsatisfied anchor
              (committee first, then most requests, then level)
    if no anchor:
        primary = fairest active player

    add primary; mark it satisfied if it is an eligible anchor

    if primary is a committee member:
        add up to courtSize - 1 requested friends
        - friends who also requested the committee member come first
        - then friends who have shared fewer courts with the committee member
        - then nested requests
    else if primary is an anchor:
        followNestedPreferences(primary)

    fill remaining places from preferences of every anchor already in group

    if two places remain:
        try to combine another anchor + one of their friends (second pair)

    fill remaining places with the fairest available players:
        - most friend edges to the current court first
        - then players without outgoing requests (preserve anchor chances)
        - then the smallest level spread with the current court
        - then hard fairness

    return group


followNestedPreferences(anchor):
    if court is full: return
    candidates = available friends of anchor
    prefer a candidate who is an unsatisfied anchor with an available friend
    add the chosen candidate
    if that candidate is an unsatisfied anchor:
        mark satisfied
        followNestedPreferences(candidate)


scoreAllocation(schedule):
    # Lower is better. Earlier items are stronger.
    1. hard violations (wrong court sizes, duplicate players, repeated round)
    2. fairness spread (max games - min games)
    3. committee unique friend requests fulfilled
    4. committee nested requests fulfilled
    5. committee direct request occurrences
    6. committee nested request occurrences
    7. all unique friend requests fulfilled
    8. all friend request occurrences
    9. total level spread across courts
    10. repeated court groups and doubles partnerships


Doubles pairing:
    try the three possible splits of a four-player court
    prefer no repeated partnership
    then no repeated opponent
    then the smallest combined-level difference between the two teams
```

## Timetable lifecycle

```text
load timetable for session:
    if a saved timetable exists:
        use it exactly as saved          # even an older allocation version
    else:
        build a timetable
        save it with the current allocation version

open session (not confirmed):
    an older saved timetable may be replaced with the current allocator
    signup / cancellation / friend change may delete the saved timetable
    admin may regenerate it

confirmed session (already announced by email or dashboard):
    never replace the saved timetable just because the allocator changed
    signup / cancellation / friend change may still delete it before release
    admin may still regenerate it before release

published session (30 minutes before start):
    the saved row is frozen
    regeneration is rejected
    deletion is a no-op
    every viewer reads the same row
```
