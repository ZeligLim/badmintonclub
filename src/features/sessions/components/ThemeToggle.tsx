"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "theme";
const EVENT = "club-theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function readIsDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

/**
 * Dark mode lives behind the page's overflow menu. The choice is stored in
 * `localStorage` and applied to `<html class="dark">`, which is what the
 * Tailwind `dark:` variant keys off.
 */
export function ThemeToggle({ onDone }: { onDone?: () => void } = {}) {
  // The class on <html> is the source of truth; the toggle only mirrors it.
  const isDark = useSyncExternalStore(
    subscribe,
    readIsDark,
    () => false,
  );

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // A browser with storage disabled still gets the theme for this page.
    }
    window.dispatchEvent(new Event(EVENT));
    onDone?.();
  }

  return (
    <button
      aria-checked={isDark}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={toggle}
      role="switch"
      type="button"
    >
      {isDark ? (
        <Moon aria-hidden="true" className="size-4" />
      ) : (
        <Sun aria-hidden="true" className="size-4" />
      )}
      <span className="flex-1">Dark mode</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          isDark ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`size-4 rounded-full bg-card shadow transition-transform ${
            isDark ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
