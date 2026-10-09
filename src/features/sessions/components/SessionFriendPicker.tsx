"use client";

import { X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  searchClubMembers,
  type FriendCandidate,
} from "@/features/sessions";

type SessionFriendPickerProps = {
  friendCandidates: FriendCandidate[];
  isAlreadySignedUp: boolean;
  isDemo: boolean;
  isPending: boolean;
  onChange: (friendIds: string[]) => void;
  onSave: (friendIds: string[]) => Promise<void>;
  selectedFriendIds: string[];
};

export function SessionFriendPicker({
  friendCandidates,
  isAlreadySignedUp,
  isDemo,
  isPending,
  onChange,
  onSave,
  selectedFriendIds,
}: SessionFriendPickerProps) {
  const [query, setQuery] = useState("");
  const [addedFriends, setAddedFriends] = useState<FriendCandidate[]>([]);
  const [searchResults, setSearchResults] = useState<FriendCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [savedFriendIds, setSavedFriendIds] = useState(selectedFriendIds);
  const [feedback, setFeedback] = useState<string | null>(null);
  const searchId = useId();
  const searchRequestId = useRef(0);
  const knownFriends = new Map(
    [...friendCandidates, ...addedFriends].map((friend) => [
      friend.userId,
      friend,
    ]),
  );
  const selectableFriends = searchResults.filter(
    (friend) => !selectedFriendIds.includes(friend.userId),
  );
  const selectedFriends = selectedFriendIds.flatMap((userId) => {
    const friend = knownFriends.get(userId);
    return friend ? [friend] : [];
  });
  const normalizedQuery = query.trim();
  const hasUnsavedChanges =
    selectedFriendIds.length !== savedFriendIds.length ||
    selectedFriendIds.some((friendId) => !savedFriendIds.includes(friendId));

  useEffect(() => {
    const requestId = searchRequestId.current;

    if (
      normalizedQuery.length < 2 ||
      normalizedQuery.length > 64 ||
      selectedFriendIds.length >= 3
    ) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      setFeedback(null);
      try {
        const results = isDemo
          ? friendCandidates.filter((candidate) => {
              const searchText =
                `${candidate.displayName} ${candidate.studentId}`.toLowerCase();
              return searchText.includes(normalizedQuery.toLowerCase());
            })
          : await searchClubMembers(normalizedQuery);

        if (searchRequestId.current === requestId) {
          setSearchResults(results);
          setActiveResultIndex(0);
          if (results.length === 0) {
            setFeedback("No club members found.");
          }
        }
      } catch {
        if (searchRequestId.current === requestId) {
          setFeedback("Could not search club members. Please try again.");
        }
      } finally {
        if (searchRequestId.current === requestId) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [
    friendCandidates,
    isDemo,
    normalizedQuery,
    selectedFriendIds.length,
  ]);

  function addSelectedFriend(friend: FriendCandidate) {
    if (isPending || selectedFriendIds.length >= 3) {
      return;
    }
    if (selectedFriendIds.includes(friend.userId)) {
      setFeedback("This friend is already selected.");
      return;
    }

    setAddedFriends((currentFriends) => [
      ...currentFriends.filter(
        (currentFriend) => currentFriend.userId !== friend.userId,
      ),
      friend,
    ]);
    onChange([...selectedFriendIds, friend.userId]);
    setQuery("");
    setSearchResults([]);
    setIsSearching(false);
    setFeedback(`${friend.displayName} added to your friend list.`);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      searchRequestId.current += 1;
      setQuery("");
      setSearchResults([]);
      setIsSearching(false);
      setFeedback(null);
      return;
    }
    if (searchResults.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResultIndex((index) => (index + 1) % searchResults.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResultIndex(
        (index) => (index - 1 + searchResults.length) % searchResults.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const friend = selectableFriends[activeResultIndex];
      if (friend) {
        addSelectedFriend(friend);
      }
    }
  }

  function removeSelectedFriend(friendId: string) {
    onChange(selectedFriendIds.filter((selectedId) => selectedId !== friendId));
  }

  async function saveFriendChoices() {
    if (isPending || isSaving || !hasUnsavedChanges) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      await onSave(selectedFriendIds);
      setSavedFriendIds(selectedFriendIds);
      setFeedback("Friend choices saved.");
    } catch {
      setFeedback("Could not save your friend choices. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <fieldset className="mt-4 border-t border-border pt-3">
      <legend className="text-sm font-medium">Play with friends (optional)</legend>
      <p className="text-xs font-medium text-muted-foreground">
        Selected friends ({selectedFriends.length}/3)
      </p>
      {selectedFriends.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {selectedFriends.map((friend) => (
            <li
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-sm text-foreground"
              key={friend.userId}
            >
              <span>
                {friend.displayName}
                <span className="ml-1 text-xs text-muted-foreground">
                  · {friend.studentId}
                </span>
              </span>
              <button
                aria-label={`Remove ${friend.displayName}`}
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={isPending}
                onClick={() => removeSelectedFriend(friend.userId)}
                type="button"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No friends selected.</p>
      )}
      <div className="mt-2 grid min-w-0 gap-1">
        <label className="text-xs font-medium" htmlFor={`${searchId}-input`}>
          Search by name or student ID
        </label>
        <input
          aria-activedescendant={
            selectableFriends[activeResultIndex]
              ? `${searchId}-option-${activeResultIndex}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={`${searchId}-results`}
          aria-expanded={selectableFriends.length > 0}
          autoComplete="off"
          className="h-10 w-full min-w-0 rounded-md bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={isPending || selectedFriendIds.length >= 3}
          id={`${searchId}-input`}
          maxLength={64}
          onChange={(event) => {
            searchRequestId.current += 1;
            setQuery(event.target.value);
            setSearchResults([]);
            setActiveResultIndex(0);
            setIsSearching(false);
            setFeedback(null);
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder="Name or ATU student ID"
          role="combobox"
          spellCheck={false}
          value={query}
        />
      </div>
      {selectableFriends.length > 0 && (
        <ul
          aria-label="Search results"
          className="mt-1 grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg"
          id={`${searchId}-results`}
          role="listbox"
        >
          {selectableFriends.map((friend, index) => (
            <li
              aria-selected={index === activeResultIndex}
              id={`${searchId}-option-${index}`}
              key={friend.userId}
              role="option"
            >
              <button
                className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                  index === activeResultIndex ? "bg-accent" : ""
                }`}
                disabled={isPending || selectedFriendIds.length >= 3}
                onClick={() => addSelectedFriend(friend)}
                onMouseEnter={() => setActiveResultIndex(index)}
                type="button"
              >
                <span className="min-w-0 truncate font-medium">
                  {friend.displayName}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {friend.studentId}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {isSearching && (
        <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
          Searching…
        </p>
      )}
      {feedback && (
        <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
          {feedback}
        </p>
      )}
      {isAlreadySignedUp && hasUnsavedChanges && (
        <Button
          className="mt-2 w-full sm:w-auto"
          disabled={isPending || isSaving || !hasUnsavedChanges}
          onClick={() => void saveFriendChoices()}
          size="sm"
          type="button"
        >
          {isSaving ? "Saving…" : "Save friend choices"}
        </Button>
      )}
    </fieldset>
  );
}
