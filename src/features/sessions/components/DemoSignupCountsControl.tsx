import type { DemoSignupCounts } from "@/features/sessions";

type DemoSignupCountsControlProps = {
  value: DemoSignupCounts;
  onChange: (dayName: keyof DemoSignupCounts, count: number) => void;
};

export function DemoSignupCountsControl({
  value,
  onChange,
}: DemoSignupCountsControlProps) {
  return (
    <section
      aria-label="Testing signup counts"
      className="mt-3 flex flex-col gap-3 rounded-xl bg-white/75 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 className="text-sm font-medium">Testing</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Set total sign-ups to preview full sessions and waitlists.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(["Monday", "Wednesday"] as const).map((dayName) => (
          <label
            className="flex items-center gap-2 text-sm"
            htmlFor={`demo-signups-${dayName.toLowerCase()}`}
            key={dayName}
          >
            <span>{dayName}</span>
            <input
              className="w-20 rounded-md bg-background px-2 py-2 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id={`demo-signups-${dayName.toLowerCase()}`}
              max={64}
              min={0}
              onChange={(event) => {
                const count = event.currentTarget.valueAsNumber;
                if (Number.isFinite(count)) {
                  onChange(dayName, Math.min(Math.max(Math.trunc(count), 0), 64));
                }
              }}
              type="number"
              value={value[dayName]}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
