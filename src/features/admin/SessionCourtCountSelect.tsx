"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateSessionCourtCount } from "./session-actions";

export function SessionCourtCountSelect({ sessionId, courtCount, disabled }: { sessionId: string; courtCount: number; disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">Courts
    <select aria-label="Courts for this session" className="h-8 rounded-md border bg-background px-2 text-foreground" value={courtCount} disabled={disabled || pending}
      onChange={(event) => { const value = Number(event.target.value); setError(""); startTransition(async () => { try { await updateSessionCourtCount(sessionId, value); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Could not update courts."); } }); }}>
      {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
    </select>{error && <span role="alert" className="text-destructive">{error}</span>}
  </label>;
}
