type SessionSignupStatusProps = {
  status: string;
  isConfirmed: boolean;
  isSignedIn: boolean;
  isSessionInProgress: boolean;
  isSessionOver: boolean;
};

export function SessionSignupStatus({
  status,
  isConfirmed,
  isSignedIn,
  isSessionInProgress,
  isSessionOver,
}: SessionSignupStatusProps) {
  if (isSessionOver) {
    return (
      <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.65rem] font-semibold text-secondary-foreground">
        Event over
      </span>
    );
  }

  if (status.includes("waitlist")) {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[0.65rem] font-semibold text-amber-900">
        Not confirmed
      </span>
    );
  }

  if (status) {
    if (status === "requested") {
      return (
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.65rem] font-semibold text-secondary-foreground">
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
