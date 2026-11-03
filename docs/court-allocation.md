Badminton Court Allocation Rules
1. Purpose
Allocate players into doubles teams of four while respecting friendship preferences, ensuring every eligible player gets an opportunity to act as an anchor, and maintaining fair game distribution.
3. Anchor Ranking
Rank eligible anchors using the following priorities, in order:
1. Committee precedence with randomisation.
2. Other candidates with friend request.
An eligible anchor is a player with at least one outgoing friend request.
4. Anchor Satisfaction Cycles
Anchor satisfaction is tracked separately from game participation and from being selected as somebody else's friend.
- At the start of an anchor cycle, identify all eligible anchors.
- Select the highest-ranked available anchor who has not yet been satisfied in the current cycle.
- Mark a player as satisfied only when they are explicitly selected as an anchor.
- Being selected as another player's friend does not satisfy that player's anchor opportunity.
- Once an anchor has been selected, they cannot be selected as an anchor again until every eligible anchor has been selected as an anchor once.
- After all eligible anchors have been satisfied, reset the satisfaction state and begin the next anchor cycle.
- If an unsatisfied anchor is unavailable because they have already been allocated to a team in the current round, they cannot anchor in that round. Do not treat their selection as somebody else's friend as satisfaction.
5. Building a Team of Four
1. Select a primary anchor according to the anchor ranking and satisfaction rules.
2. Start the team with the primary anchor.
3. Look at the anchor's outgoing friend list and consider only players who are still available in the current round.
4. Randomly select available friends as needed, subject to the nested-anchor rule below.
5. Remove allocated players from the available pool so they cannot be assigned to another team in the same round.
5.1 Nested Anchors
Whenever a player is selected into a team as a friend, check whether that player is also an eligible, unsatisfied anchor.
- If they are, try to use their own outgoing friend preferences to complete the team before choosing unrelated players.
- Continue recursively: a newly selected friend may itself be an eligible, unsatisfied anchor, whose preferences can be followed in turn.
- Each player can appear only once in a team and only once across teams in the same round.
- Mark every player whose preferences are explicitly used as an anchor as satisfied in the current anchor cycle.
- A player merely included in the team, without their own preferences being used, is not satisfied.
- A team can contain up to four anchors, since it contains only four players.
Example:
Player acting as anchor	Friend listed
A	B
B	C
C	D


The team can be A, B, C and D. A, B and C are all anchors and are all marked satisfied because each person's outgoing preference was followed.
5.2 Combining Two-Person Friendship Pairs
When an anchor has only one available friend, their preference forms a two-person pair.
- Try to find another available two-person pair to fill the same team of four.
- The second pair may also be based on one-way requests; mutual requests are not required.
- If the second pair's anchor is eligible and unsatisfied, mark that anchor satisfied when their preference is used.
- If no suitable second pair is available, fill the remaining team positions using other available friendship preferences where possible.
- Do not leave team positions empty solely because a second pair could not be found.

5.3 Committee Friend Coverage
- Rank committee anchors ahead of other anchors, then rank by number of outgoing friend requests.
- Put up to three of the committee anchor's available requested friends on the same court before following nested requests.
- When the committee has more than three available requested friends, prefer friends who have shared fewer courts with them so requests rotate across the session.
- Fill any court places left after direct requests with available nested friend requests. Once every direct request has been matched on court at least once, reserve one place for an available nested friend request in later games when possible, while keeping a direct friend on court.
- A four-player court cannot include the committee member, all three direct friends, and an additional nested friend in the same game. Prioritize direct-request coverage first, then nested-request coverage across later games.
6. Game Fairness (Hard Constraint)
Game fairness is separate from anchor satisfaction.
- No player may receive a second game until every eligible player has received their first game.
- After everyone has played once, prioritise players with the fewest games played.
- Among players with equal game counts, prioritise the player who has waited longest / rested longest.
- Anchor priority must never override the hard game-fairness constraint.

8. Allocation Constraints and Fallbacks
- A player can be allocated to at most one team per round.
- Never allocate a player who is not available.
- If exactly three players remain after filling the available full courts and a spare court is available, place those three on the spare court for a three-player game.
- If an anchor's preferred friends are unavailable, consider their other available listed friends.
- If the friendship preferences cannot fill all four positions, use the next suitable available friendship preferences as a fallback.
- Keep filling available team positions rather than leaving a court partially empty when eligible players remain.
- Do not relax the hard game-fairness constraint to satisfy friendship preferences.
9. Separation of Concepts
Keep these concepts as separate state:
- Games played: used for game fairness.
- Rest / waiting time: used to break ties between players with equal games played.
- Anchor satisfaction: records whether a player has already had their anchor opportunity in the current anchor cycle.
- Availability in the current round: records whether a player can still be allocated to a team in that round.
Being selected as a friend changes availability, but does not by itself change anchor satisfaction.
