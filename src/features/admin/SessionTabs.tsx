"use client";

import { Children, useState, type ReactNode } from "react";
import { formatTimeOfDay } from "@/lib/format";

export type SessionTabItem = {
  id: string;
  dayName: string;
  date: string;
  startsAt: string;
};

export function SessionTabs({
  sessions,
  children,
}: {
  sessions: SessionTabItem[];
  children: ReactNode;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const panels = Children.toArray(children);

  if (sessions.length === 0) return null;

  function selectTab(index: number) {
    setActiveIndex((index + sessions.length) % sessions.length);
  }

  return (
    <div>
      <div
        aria-label="Sessions"
        className="mb-6 flex gap-2 overflow-x-auto border-b border-border pb-2"
        role="tablist"
      >
        {sessions.map((session, index) => {
          const isSelected = index === activeIndex;
          const label = `${session.dayName}, ${new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "short",
          }).format(new Date(`${session.date}T12:00:00Z`))} · ${formatTimeOfDay(session.startsAt)}`;

          return (
            <button
              key={session.id}
              id={`session-tab-${session.id}`}
              type="button"
              role="tab"
              aria-controls={`session-panel-${session.id}`}
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => selectTab(index)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  selectTab(index + 1);
                  document.getElementById(`session-tab-${sessions[(index + 1) % sessions.length].id}`)?.focus();
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  selectTab(index - 1);
                  document.getElementById(`session-tab-${sessions[(index - 1 + sessions.length) % sessions.length].id}`)?.focus();
                } else if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  const nextIndex = event.key === "Home" ? 0 : sessions.length - 1;
                  selectTab(nextIndex);
                  document.getElementById(`session-tab-${sessions[nextIndex].id}`)?.focus();
                }
              }}
              className={`shrink-0 rounded-t-md border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                isSelected
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {sessions.map((session, index) => (
        <section
          key={session.id}
          id={`session-panel-${session.id}`}
          role="tabpanel"
          aria-labelledby={`session-tab-${session.id}`}
          hidden={activeIndex !== index}
          tabIndex={0}
        >
          {panels[index]}
        </section>
      ))}
    </div>
  );
}
