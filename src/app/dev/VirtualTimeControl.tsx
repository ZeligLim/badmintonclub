"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

function toDatetimeLocal(value: string | null) {
  if (!value) return "";
  return value.slice(0, 16);
}

export function VirtualTimeControl() {
  const [value, setValue] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .rpc("get_virtual_now")
      .then(({ data, error }) => {
        if (error) {
          setStatus(error.message);
          return;
        }
        setCurrentTime(data ?? "");
        setValue(toDatetimeLocal(data));
      });
  }, []);

  async function applyTime() {
    setStatus(null);
    const supabase = createClient();
    const { error } = await supabase.rpc(
      "set_virtual_now",
      value ? { p_virtual_now: new Date(value).toISOString() } : { p_virtual_now: null },
    );
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus(value ? "Virtual time set." : "Virtual time reset to real time.");
  }

  return (
    <section className="mb-6 rounded-xl bg-muted/40 p-4">
      <h2 className="mb-4 text-lg font-semibold">Virtual time</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Overrides Postgres <code>now()</code> for local testing. Leave empty and apply to reset to real time.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
          Date and time
          <input
            className="h-9 rounded-md bg-muted px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setValue(event.target.value)}
            type="datetime-local"
            value={value}
          />
        </label>
        <button
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          onClick={applyTime}
          type="button"
        >
          Apply
        </button>
        <button
          className="h-9 rounded-md bg-background px-4 text-sm font-medium"
          onClick={() => {
            setValue("");
            void applyTime();
          }}
          type="button"
        >
          Reset
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Current virtual time: {currentTime || "not loaded"}
      </p>
      {status && (
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      )}
    </section>
  );
}