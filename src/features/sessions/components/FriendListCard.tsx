"use client";

import { UsersRound, X } from "lucide-react";
import type { FriendCandidate } from "../types";

type FriendListCardProps = {
  friends: FriendCandidate[];
  pendingFriendId: string | null;
  onRemove: (friendId: string) => void;
};

export function FriendListCard({
  friends,
  pendingFriendId,
  onRemove,
}: FriendListCardProps) {
  return (
    <section
      aria-labelledby="friend-list-heading"
      className="mt-4 rounded-2xl bg-white p-4 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <UsersRound aria-hidden="true" className="size-4 text-primary" />
        <h2 className="text-base font-medium" id="friend-list-heading">
          Friend list
        </h2>
      </div>
      {friends.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {friends.map((friend) => (
            <li
              className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-secondary/60 px-3 py-2"
              key={friend.userId}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {friend.displayName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {friend.studentId}
                </span>
              </span>
              <button
                aria-label={`Remove ${friend.displayName} from friend list`}
                className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                disabled={pendingFriendId === friend.userId}
                onClick={() => onRemove(friend.userId)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Friends you add while choosing session preferences will appear here.
        </p>
      )}
    </section>
  );
}
