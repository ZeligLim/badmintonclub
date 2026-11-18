export const FRIEND_GROUP_STYLES = [
  { ring: "ring-rose-500", hex: "#e11d48" },
  { ring: "ring-sky-500", hex: "#0284c7" },
  { ring: "ring-amber-500", hex: "#d97706" },
  { ring: "ring-violet-500", hex: "#7c3aed" },
  { ring: "ring-emerald-500", hex: "#059669" },
  { ring: "ring-fuchsia-500", hex: "#c026d3" },
  { ring: "ring-cyan-500", hex: "#0891b2" },
  { ring: "ring-lime-500", hex: "#65a30d" },
  { ring: "ring-orange-500", hex: "#ea580c" },
  { ring: "ring-indigo-500", hex: "#4f46e5" },
  { ring: "ring-teal-500", hex: "#0d9488" },
  { ring: "ring-pink-500", hex: "#db2777" },
] as const;

type FriendPlayer = {
  id: string;
  friendIds?: string[];
};

export type CourtFriendGroup = {
  label: string;
  ring: (typeof FRIEND_GROUP_STYLES)[number]["ring"];
  hex: string;
};

/** Gives each connected group among attendees a stable, distinct colour. */
export function getFriendGroups(
  players: FriendPlayer[],
): Map<string, CourtFriendGroup> {
  const playerIds = new Set(players.map((player) => player.id));
  const neighbours = new Map(players.map((player) => [player.id, new Set<string>()]));

  for (const player of players) {
    for (const friendId of player.friendIds ?? []) {
      if (friendId === player.id || !playerIds.has(friendId)) continue;
      neighbours.get(player.id)?.add(friendId);
      neighbours.get(friendId)?.add(player.id);
    }
  }

  const visited = new Set<string>();
  const groups: string[][] = [];
  for (const player of players) {
    if (visited.has(player.id) || neighbours.get(player.id)?.size === 0) continue;
    const stack = [player.id];
    const members: string[] = [];
    visited.add(player.id);

    while (stack.length > 0) {
      const current = stack.pop()!;
      members.push(current);
      for (const friendId of neighbours.get(current) ?? []) {
        if (visited.has(friendId)) continue;
        visited.add(friendId);
        stack.push(friendId);
      }
    }

    groups.push(members.sort(compareIds));
  }

  groups.sort((a, b) => compareIds(a[0]!, b[0]!));
  const result = new Map<string, CourtFriendGroup>();
  groups.forEach((memberIds, index) => {
    const style = FRIEND_GROUP_STYLES[index % FRIEND_GROUP_STYLES.length]!;
    const group = {
      label: `Friend group ${index + 1}`,
      ring: style.ring,
      hex: style.hex,
    };
    for (const memberId of memberIds) result.set(memberId, group);
  });

  return result;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
