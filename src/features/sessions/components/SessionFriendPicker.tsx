"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  findFriendByStudentId,
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
  sessionId: string;
};

export function SessionFriendPicker({
  friendCandidates,
  isAlreadySignedUp,
  isDemo,
  isPending,
  onChange,
  onSave,
  selectedFriendIds,
  sessionId,
}: SessionFriendPickerProps) {
  const [studentId, setStudentId] = useState("");
  const [addedFriends, setAddedFriends] = useState<FriendCandidate[]>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedFriendIds, setSavedFriendIds] = useState(selectedFriendIds);
  const [feedback, setFeedback] = useState<string | null>(null);
  const knownFriends = new Map(
    [...friendCandidates, ...addedFriends].map((friend) => [
      friend.userId,
      friend,
    ]),
  );
  const selectedFriends = selectedFriendIds.flatMap((userId) => {
    const friend = knownFriends.get(userId);
    return friend ? [friend] : [];
  });
  const normalizedStudentId = studentId.trim().toLowerCase();
  const isDuplicate = [...knownFriends.values()].some(
    (friend) =>
      friend.studentId.toLowerCase() === normalizedStudentId &&
      selectedFriendIds.includes(friend.userId),
  );
  const hasUnsavedChanges =
    selectedFriendIds.length !== savedFriendIds.length ||
    selectedFriendIds.some((friendId) => !savedFriendIds.includes(friendId));

  async function addFriend() {
    if (isPending || isLookingUp || selectedFriendIds.length >= 3) {
      return;
    }
    if (!/^[a-z0-9]{1,64}$/.test(normalizedStudentId)) {
      setFeedback("Enter a valid ATU student ID.");
      return;
    }
    if (isDuplicate) {
      setFeedback("This friend is already selected.");
      return;
    }

    setIsLookingUp(true);
    setFeedback(null);
    try {
      const friend = isDemo
        ? friendCandidates.find(
            (candidate) =>
              candidate.studentId.toLowerCase() === normalizedStudentId,
          ) ?? null
        : await findFriendByStudentId(normalizedStudentId);

      if (!friend) {
        setFeedback("Student ID not found.");
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
      setStudentId("");
      setFeedback(`${friend.displayName} added.`);
    } catch {
      setFeedback("Could not check this student ID. Please try again.");
    } finally {
      setIsLookingUp(false);
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
    <fieldset className="mt-4">
      <legend className="text-sm font-medium">Play with friends (optional)</legend>
      <p className="mb-2 mt-1 text-xs leading-5 text-muted-foreground">
        {isDemo
          ? "Use a sample ATU student ID for preview only. Choices do not change real bookings or matching."
          : "Add up to 3 existing club members. This is a preference only; committee priority and longest-since-last-play fairness come first. Friends who are not eligible for this session are ignored."}
      </p>
      <p className="text-xs font-medium text-muted-foreground">
        Selected friends ({selectedFriends.length}/3)
      </p>
      {selectedFriends.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {selectedFriends.map((friend) => (
            <li
              className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm text-foreground"
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
        <p className="mt-2 text-sm text-muted-foreground">No friends selected.</p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label
            className="text-xs font-medium"
            htmlFor={`friend-student-id-${sessionId}`}
          >
            ATU student ID
          </label>
          <input
            autoCapitalize="none"
            autoComplete="off"
            className="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm"
            disabled={isPending || isLookingUp || selectedFriendIds.length >= 3}
            id={`friend-student-id-${sessionId}`}
            maxLength={64}
            onChange={(event) => {
              setStudentId(event.target.value);
              setFeedback(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addFriend();
              }
            }}
            placeholder="g00440629"
            spellCheck={false}
            value={studentId}
          />
        </div>
        <Button
          disabled={
            isPending ||
            isLookingUp ||
            !studentId ||
            selectedFriendIds.length >= 3
          }
          onClick={() => void addFriend()}
          size="sm"
          type="button"
          variant="outline"
        >
          {isLookingUp ? "Checking…" : "Add friend"}
        </Button>
      </div>
      {feedback && (
        <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
          {feedback}
        </p>
      )}
      {isAlreadySignedUp && (
        <Button
          className="mt-3"
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
