import type { SessionSignupStatus as SignupStatus } from "../types";

type SessionSignupStatusProps = {
  status: SignupStatus | "";
  isCancelled: boolean;
  isConfirmed: boolean;
  isSignedIn: boolean;
  isSessionInProgress: boolean;
  isSessionOver: boolean;
};

export function SessionSignupStatus({
  status,
  isCancelled,
  isConfirmed,
  isSignedIn,
  isSessionInProgress,
  isSessionOver,
}: SessionSignupStatusProps) {
  if (isCancelled) {
    return (
      <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.65rem] font-semibold text-secondary-foreground">
        Not happening
      </span>
    );
  }

  if (isSessionOver) {
    return (
      <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.65rem] font-semibold text-secondary-foreground">
        Event over
      </span>
    );
  }

  if (status === "waitlisted") {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[0.65rem] font-semibold text-amber-900">
        Not confirmed
      </span>
    );
  }

  if (status) {
    if (status === "requested") {
      return (
        <span className="inline-flex h-10 items-center rounded-full bg-secondary px-3 text-[0.65rem] font-semibold text-secondary-foreground">
          Awaiting confirmation
        </span>
      );
    }

    if (status === "played") {
      return (
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold text-primary">
          Played
        </span>
      );
    }

    if (status === "selected") {
      return (
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold text-primary">
          {isSessionInProgress ? "In progress" : "Confirmed"}
        </span>
      );
    }

    return (
      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold text-primary">
        {isConfirmed ? "Not signed up" : "Not confirmed"}
      </span>
    );
  }

  if (isConfirmed) {
    return (
      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold text-primary">
        {isSignedIn ? "Not signed up" : "Session confirmed"}
      </span>
    );
  }

  return null;
}
