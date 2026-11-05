"use client";

import { useEffect } from "react";
import { logError } from "@/lib/log";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("Unhandled application error.", error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            The club app could not load
          </h1>
          <p style={{ color: "#52525b", marginBottom: "1rem" }}>
            The error has been logged. Try again — if it keeps happening, let the
            committee know.
          </p>
          {error.digest ? (
            <p style={{ color: "#71717a", fontSize: "0.75rem", marginBottom: "1rem" }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              borderRadius: "0.5rem",
              border: "1px solid #d4d4d8",
              background: "white",
              padding: "0.4rem 0.8rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
