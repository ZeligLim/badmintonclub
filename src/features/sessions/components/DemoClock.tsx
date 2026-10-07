type DemoClockProps = {
  value: string;
  isOverridden: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
};

export function DemoClock({
  value,
  isOverridden,
  onChange,
  onReset,
}: DemoClockProps) {
  return (
    <section
      aria-label="Demo clock"
      className="mt-4 flex flex-col gap-3 rounded-xl bg-white/75 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <label className="text-sm font-medium" htmlFor="demo-clock">
          Demo clock · Europe/London
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Set a date and time to preview signup and session states.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="rounded-md bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id="demo-clock"
          onChange={(event) => onChange(event.currentTarget.value)}
          type="datetime-local"
          value={value}
        />
        <button
          className="rounded-md px-2 py-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          disabled={!isOverridden}
          onClick={onReset}
          type="button"
        >
          Use live time
        </button>
      </div>
    </section>
  );
}
