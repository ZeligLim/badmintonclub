# Badminton court allocation rules

## 1. Purpose

Allocate confirmed players into four-player courts for every 15-minute round of
a session. The allocator must:

1. give every player an even number of games;
2. maximise the friend requests that end up on the same court, with committee
   requests first;
3. rank the remaining choices by playing level;
4. produce the same timetable for every viewer, and never change a timetable
   that has already been released.

## 2. Priority order

The allocator applies these rules in order. A lower rule never overrides a
higher one.

1. **Game fairness (hard constraint).** Players with fewer games are selected
   before players with more games. Between equal game counts, the player who
   has rested longest is selected first.
2. **Committee friend pairing.** Committee members are considered before other
   anchors. A committee member's direct requests are placed on their court
   before unrelated players.
3. **Other friend pairing.** Remaining anchors follow their outgoing requests,
   including nested chains such as `A -> B -> C -> D` and two-person pairs such
   as `A <-> B` plus `C <-> D`.
4. **Level ranking.** Once friendship has decided what it can, players of a
   similar level share a court. Higher-level players rank first when a choice
   remains.
5. **Variety.** Avoid repeating the same court group, doubles partnership and
   doubles opponent across rounds.

Level never changes who is selected to play. It only decides how the selected
players are arranged once fairness and friendship are satisfied.

## 3. Levels

The club has three levels:

| Level | Value | Who can set it |
| --- | --- | --- |
| `BEGINNER` | 1 | the member |
| `INTERMEDIATE` | 2 | the member |
| `PROFESSIONAL` | 3 | a committee administrator (invite only) |

A missing level is treated as `INTERMEDIATE`, matching the database default.
Complete courts prefer the smallest level spread, so professionals play with
professionals and beginners with beginners when friendship does not already
decide the court. Doubles teams are then split so both sides have a similar
combined level.

## 4. Anchor ranking

An **anchor** is a player with at least one outgoing friend request. Rank
eligible anchors by:

1. committee members first;
2. more outgoing requests first;
3. higher level first;
4. a stable per-session tie-break, then player id.

The tie-break is derived from the session id and player id. It is stable for a
given roster and seed, so it never changes between two loads of the same
session. It is not re-rolled per request or per viewer.

## 5. Anchor satisfaction cycles

Anchor satisfaction is separate from games played and from being selected as
somebody else's friend.

- At the start of a cycle, every eligible anchor is unsatisfied.
- Select the highest-ranked available unsatisfied anchor.
- Mark a player satisfied only when they are explicitly selected as an anchor.
- Being selected as another player's friend does **not** satisfy that player's
  anchor opportunity.
- A satisfied anchor cannot anchor again until every eligible anchor has been
  selected once. Then the cycle resets.
- An unsatisfied anchor who is already allocated to another court in the same
  round cannot anchor that round. They remain eligible for a later round.

## 6. Building a court

1. Select a primary anchor using the ranking and satisfaction rules.
2. Start the court with the primary anchor.
3. Consider only that anchor's outgoing friends who are still available in the
   current round.
4. Follow nested anchors deeply before choosing unrelated friends.
5. Remove allocated players from the available pool so they cannot appear on
   two courts in the same round.
6. If fewer than four players remain in the court, fill the places with the
   fairest available players. Between equal fairness, prefer players who are
   already connected to the court, then players without outgoing requests (so
   their anchor opportunity is preserved), then the closest level.

### 6.1 Nested anchors

Whenever a player is selected as a friend, check whether they are also an
eligible, unsatisfied anchor.

- If they are, follow their outgoing preferences before returning to the
  original anchor's other friends.
- Continue recursively. `A -> B -> C -> D` can fill a complete court.
- Each player appears only once per court and once per round.
- Mark every player whose preferences are explicitly used as satisfied.
- A player merely included in the court, without their preferences being used,
  is not satisfied.
- A court contains at most four anchors because it contains four players.

### 6.2 Two-person pairs

When an anchor has only one available friend, the pair can share a court with
another available pair (`A -> B` plus `C -> D`). Mutual requests are not
required. If no second pair exists, fill the remaining places from the other
available preferences, then from the fairest players. Do not leave a court
partly empty while eligible players remain.

### 6.3 Committee friend coverage

- Committee anchors rank ahead of other anchors.
- Put up to three of the committee member's available requested friends on the
  same court.
- Prefer friends who also requested the committee member: those pairs satisfy
  two requests instead of one.
- When more than three requested friends are available, rotate the remaining
  friends across rounds, preferring friends who have shared fewer courts with
  the committee member.
- Fill remaining places with available nested requests. Once every direct
  request has appeared on court at least once, reserve a place for a nested
  request where possible.
- Direct-request coverage comes before nested-request coverage.

## 7. Game fairness (hard constraint)

- No player receives a second game until every eligible player has received
  their first game.
- After everyone has played once, select players with the fewest games.
- Between equal game counts, select the player who has rested longest, then the
  player with the greatest total rest.
- Friendship, committee priority and level must never relax this constraint.

## 8. Allocation constraints and fallbacks

- A player can be allocated to at most one court per round.
- Never allocate a player who is not in the confirmed roster.
- If exactly three players remain after filling every available full court, and
  a spare court exists, use the spare court for a three-player game.
- If an anchor's preferred friends are unavailable, consider their other
  available friends.
- If friendship cannot fill every place, keep filling from the fairest
  available players rather than leaving a court short.
- A session duration that is not a multiple of 15 minutes allocates a final
  short round. The final round ends at the session end time.

## 9. Deterministic timetables

The allocator must return the same timetable for the same session and roster,
regardless of:

- the order the database returned the roster rows;
- the order of a player's friend ids;
- which user or server process asks for the timetable;
- how many times the timetable is calculated.

To guarantee this:

- the roster is sorted by player id before allocation;
- friend lists are de-duplicated, self-references are removed, and ids are
  sorted;
- seeded tie-break values are derived from the session id and player id, not
  from array positions;
- every remaining tie is broken by player id;
- candidate schedules are compared with a fixed score order (hard violations,
  fairness, committee friendship, other friendship, level spread, repeated
  courts and partnerships).

## 10. Published timetables are immutable

A timetable becomes **confirmed** when the session is confirmed and the first
court assignment is announced (for example in the booking email). It becomes
**published** 30 minutes before the session starts, when the full timetable is
shown to players.

- The saved `session_timetables` row is the single source of truth. The admin
  view, every member's personal "Your games" list and the booking confirmation
  email all read this row.
- The allocator is only a way to create that row. It is not run again for a
  confirmed or published timetable unless the row is explicitly invalidated
  before release.
- A confirmed timetable is accepted even if it was produced by an older
  allocation version, because it has already been announced to players. The
  version only refreshes a timetable for an open session that nobody has been
  told about yet. Once released, nothing refreshes or rewrites the saved row.
- When an open session is confirmed, any preview timetable is discarded and
  rebuilt from the final roster.
- Signup, cancellation and friend-preference changes invalidate the saved
  timetable only before publication. After publication they are rejected by
  the database and do not delete the timetable.
- The admin "Regenerate schedule" action is disabled after publication.
- A database trigger rejects direct updates and deletes of a published
  timetable from authenticated committee clients.

This prevents the failure mode where two viewers, an admin and a member, or a
member's email and their dashboard showed different courts for the same
session.
