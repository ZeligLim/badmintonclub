#!/usr/bin/env node
/**
 * Guards the pgTAP fixtures against wall-clock dependence.
 *
 * A session fixture that derives its date from `now()` but lets the template
 * decide when sign-ups open behaves differently depending on the hour the suite
 * runs: `admin_publish_scheduled_sessions()` only reconciles sessions whose
 * `signup_opens_at` is still in the future, so a lead time landing on midnight
 * flips the result between 23:59 and 00:01 (BC-46).
 *
 * Every `insert into public.sessions` that mentions `now()` must therefore set
 * `signup_opens_at` itself. Because the sessions table requires sign-ups to open
 * before they close, it must set `confirmation_at` too — a template-derived
 * deadline can already be in the past when the fixture's window is pinned into
 * the future.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const directory = process.argv[2] ?? "supabase/tests";
const problems = [];

for (const name of readdirSync(directory).filter((file) => file.endsWith(".sql"))) {
  const sql = readFileSync(join(directory, name), "utf8");
  const fixtures = sql.split(/insert into public\.sessions/gi).slice(1);

  for (const fixture of fixtures) {
    const end = fixture.indexOf(";");
    const block = end === -1 ? fixture : fixture.slice(0, end);
    if (/\bnow\(\)/.test(block)) {
      if (!/signup_opens_at/.test(block)) {
        problems.push(
          `${name}: a session fixture derives its date from now() without setting signup_opens_at`,
        );
      }
      if (!/confirmation_at/.test(block)) {
        problems.push(
          `${name}: a session fixture derives its date from now() without setting confirmation_at`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`error: ${problem}`);
  console.error(
    "\nSet signup_opens_at and confirmation_at explicitly (for example now() + interval '1 day' and now() + interval '2 days') so the fixture does not depend on the hour the suite runs.",
  );
  process.exit(1);
}

console.log("Session fixtures set their own sign-up window.");
