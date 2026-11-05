# Engineering backlog

Not a "technical debt" file: about half of this is broken behaviour and half is
missing product, so the name is deliberately broader. One ticket per heading,
stable IDs, **P0** = before the next club night, **P1** = this month, **P2** =
opportunistic. Sizes are rough (`S` ≈ an evening, `M` ≈ a weekend, `L` ≈ a week).
Every ticket is scoped to fit one PR and names its evidence in this repo.

---

## P0 — fix before the next session

### BC-01 · P0 · S — Any anonymous visitor can move the club's clock
**Problem** `supabase/migrations/20261026160000_dev_virtual_clock.sql` disables RLS
on `public.dev_virtual_clock` (`:15`), grants `UPDATE` to `anon` (`:13`), and grants
`EXECUTE` on the `security definer` `set_virtual_now()` / `reset_virtual_now()` to
`anon` (`:47`, `:64`). With the public anon key, one unauthenticated POST shifts
`now()` for the whole database and the member UI clock. Signup windows, confirmation
deadlines and the fairness draw all move with it.
**Fix** Revoke everything from `anon`/`authenticated`, enable RLS, drop the `UPDATE`
grant, and let only `service_role` touch it. Remove `public.now()` and the
`public, pg_catalog` search-path override from the production chain (or gate the
whole thing behind a `dev` schema that is never deployed).
**Done when** a pgTAP test proves `anon` and `authenticated` cannot select, update,
or execute any dev-clock object, and production `now()` is `pg_catalog.now()`.

### BC-02 · P0 · M — Members and committee see different timetables
**Problem** The member dashboard recomputes a schedule on every request
(`src/features/sessions/api/dashboard.ts:188`) and never reads
`session_timetables`. The admin page reads the persisted row, but only checks
`allocationVersion` (`src/features/admin/data.ts:278`), never the roster or friend
preferences. So a persisted schedule goes stale forever while every member sees a
fresh one. This is the "Elliot saw a different timetable" incident.
**Fix** Make the persisted row the single source of truth: store a fingerprint
(sorted player ids + signup statuses + friend preferences + `allocationVersion` +
seed), and have both dashboards read that one row. Only regenerate through one
server path, and recompute the fingerprint whenever an input can change.
**Done when** a pgTAP/vitest case shows that changing a signup, a friend preference
or a friend list changes the fingerprint, and both `/` and `/admin` return the same
`court_schedule` for the same session.

### BC-03 · P0 · S — "Regenerate" deletes the old timetable before making a new one
**Problem** `regenerateSessionCourtSchedule` deletes the row
(`src/features/admin/session-actions.ts:30`), then calls
`loadAdminData({ allocationSeed: randomUUID() })`, which regenerates **every**
session whose persisted schedule is stale, not just the target. If the target comes
back empty it throws — after the delete. A failure leaves the session with no
timetable and unrelated sessions rewritten.
**Fix** Generate the new schedule in memory first, validate it, then swap it in one
`upsert`. Pass the target session id so the action only touches that session.
**Done when** a forced generation failure leaves the previous row intact.

### BC-04 · P0 · S — Cancelling never promotes anyone from the waitlist
**Problem** `cancel_session_signup`
(`supabase/migrations/20261019015000_allow_friend_preferences_until_cancellation_deadline.sql:357`)
sets the row to `cancelled` and calls `private.rematch_session_slots`, which only
reorders players already `selected`
(`supabase/migrations/20261021180000_optimize_court_slot_allocation.sql:188-207`).
Nobody is moved off the waitlist, so a freed place stays empty.
**Fix** After a cancellation on a `confirmed` session, select the top
`waitlisted` row by the same fairness ordering used at confirmation, promote it,
then rematch.
**Done when** a pgTAP test cancels a selected signup on a full session and asserts a
waitlisted member becomes `selected` and appears in the schedule.

### BC-05 · P0 · S — Cancelling a signup can report an error after it succeeded
**Problem** `src/features/sessions/api/actions.ts:246` awaits
`invalidateSessionTimetable()` **after** the RPC has committed. If the cache clear
fails, the user sees "Could not refresh…" while their place is already cancelled, so
they retry and get "No open signup request was found".
**Fix** Cache invalidation is best-effort: log it, never throw. Same for
`updateSessionFriendPreferences`.
**Done when** a failing invalidation still returns success to the client and the
signup row reflects the cancellation.

### BC-06 · P0 · S — Allocator returns invalid schedules silently
**Problem** `allocateCourtSchedule` runs `validateSchedule(...)` inside a
`try/catch` that does nothing (`src/features/sessions/court-schedule.ts:1074-1080`).
Double-booked players, wrong court sizes or a round with a missing court pass
straight through to persistence and email.
**Fix** Let the validation throw (or drop the candidate and try the next), and treat
"no valid candidate" as a hard error the admin sees.
**Done when** a fuzz test can inject a broken candidate and the function rejects it
instead of returning it.

---

## P1 — correctness and features people already believe exist

### BC-07 · P1 · S — Confirmation only happens if someone has the dashboard open
**Problem** Finalization is a client effect
(`src/features/sessions/components/SessionsDashboard.tsx:175-213`) gated on the
browser clock. No member online at the deadline means no confirmation, no timetable
and no email until the next visit; a wrong device clock runs it early or late.
**Fix** Run `finalize_due_sessions` server-side on a timer: `pg_cron` in Supabase, or
a Vercel cron hitting an authenticated route. Keep the client call as a fallback.
**Done when** a session is confirmed without any browser being open.

### BC-08 · P1 · S — Full timetables are readable by anonymous users
**Problem** `public.session_timetables` is granted `SELECT` to `anon`
(`supabase/migrations/20261027090000_persisted_session_timetables.sql:51`) with
`using (true)` (`:12`). Anyone with the public key can list who plays on which court
and when.
**Fix** Drop the `anon` grant and require an authenticated `@atu.ie` member; decide
whether members may read other sessions' schedules at all.
**Done when** an anonymous request to `/rest/v1/session_timetables` returns no rows.

### BC-09 · P1 · S — Friend-list changes do not invalidate the timetable
**Problem** `addClubFriend` / `removeClubFriend`
(`src/features/sessions/api/actions.ts:103-125`) never invalidate
`session_timetables`, and there is no DB trigger. Changing your friend list silently
leaves every persisted schedule stale.
**Fix** Invalidate on those RPCs, or better, add a trigger on `club_friend_list` and
`session_friend_preferences` that bumps a `schedule_revision` on affected sessions.
**Done when** adding a friend changes the next read's fingerprint.

### BC-10 · P1 · S — The admin page writes to the database while rendering
**Problem** `loadAdminData` computes and `upsert`s schedules inside a GET render
(`src/features/admin/data.ts:305-320`), with `generated_by: null`, and swallows write
errors. A render can therefore persist a schedule the admin never saw, and the page
cannot tell whether saving worked.
**Fix** Make the GET read-only; move generation to an explicit action ("generate
schedule") and record the acting admin in `generated_by`.
**Done when** loading `/admin` performs zero writes.

### BC-11 · P1 · S — One unexpected database value breaks the whole dashboard
**Problem** `parsePlayerLevel`, `getDayName`, `getAllocationMode` and
`getSessionStatus` throw on any unknown value
(`src/features/sessions/api/dashboard.ts:399-450`), and the session list is mapped
outside a per-row guard. One bad enum row 500s the page for everyone.
**Fix** Parse defensively, log the offending row id, and render a "needs attention"
state instead of throwing.
**Done when** a session with an unknown status still renders the rest of the page.

### BC-12 · P1 · M — Booking emails are slow, duplicated and invisible when they fail
**Problem** `sendSelectedBookingConfirmationEmails`
(`src/features/sessions/api/booking-confirmation-email.ts:88-140`) loads recipients
one auth call at a time, sends one Mailjet request per recipient, recomputes the
whole court schedule per recipient (`:209`), and emails every `selected` row for
every due session on each run — there is no per-recipient "already emailed" record.
Failures log only `stage` and `errorName` (`:84-89`).
**Fix** Reuse one allocation per session, batch Mailjet sends, add a
`booking_emails(session_id, user_id, sent_at)` table (or a `confirmation_email_sent_at`
column) and send only rows that are null.
**Done when** re-running finalization for an already-confirmed session sends zero
emails and one run for 40 players makes one allocation and one batched send.

### BC-13 · P1 · S — README promises behaviour the code does not have
**Problem** `README.md` says members can cancel "until the session starts" (the UI
cuts off 30 minutes before, `src/features/sessions/components/SessionsDashboard.tsx:527`,
and `cancel_session_signup` does the same in SQL), says complete courts "prefer
compatible levels" (allocator ignores level, see BC-14), and tells you to copy
`.env.example` (the file does not exist). It also says local email capture is
disabled while `docs/local-test.md` documents Mailpit.
**Fix** Correct the three claims and add `.env.example` (names only, no values).
**Done when** a fresh clone can follow the README end to end without guessing.

### BC-14 · P1 · M — The three-level system does almost nothing
**Problem** The allocator's `PlayerLevel` is `"BEGINNER" | "INTERMEDIATE" |
"ADVANCED"` (`src/features/sessions/court-schedule.ts:7`) while the database and
`src/types/player.ts` say `"PROFESSIONAL"`; `rosterPlayers` never copies `level`
(`src/features/sessions/api/dashboard.ts:176-184`), and no scoring function reads
it. Selection also has no level term
(`supabase/migrations/20261021180000_optimize_court_slot_allocation.sql:293-300`).
So "rank the rest by level" and "compatible courts" are both unimplemented.
**Fix** Pick one union (the DB one), pass `level` into the roster, add a soft
level-compatibility score after fairness and friendships, and a tie-breaker in the
draw. Document what level actually controls.
**Done when** a mixed-level roster produces different courts than a same-level one
in a fixture test, without changing fairness results.

### BC-15 · P1 · S — There is no way to make someone a committee admin
**Problem** `/admin` can toggle committee and Professional access
(`src/features/admin/player-actions.ts`), but `is_committee_admin` can only be set by
the hand-written SQL in the README. Adding a second admin, or replacing one who
leaves, currently needs database access.
**Fix** Add admin-role management with a "there must always be at least one admin"
guard, and audit the change.
**Done when** two admins can be managed from `/admin` and the last one cannot be
removed.

### BC-16 · P1 · M — Committee cannot fix a bad timetable by hand
**Problem** `CourtScheduleTable` can cancel a session or regenerate everything
(`src/features/admin/CourtScheduleTable.tsx`), but cannot add/remove a player, move
someone to another court, promote a waitlister, or lock a court. When the algorithm
is wrong — which is the reported complaint — the only tool is "roll the dice again".
**Fix** Add per-session editing (drag or select), a "promote from waitlist" action,
and an audit entry per change.
**Done when** a committee member can repair a schedule without touching SQL.

### BC-17 · P1 · M — Fees are decorative
**Problem** `fee_cents` is displayed ("Pay on arrival") but nothing records payment:
no paid/unpaid state, no method, no reconciliation. The Friday session charges €3 and
the committee has no list of who owes it.
**Fix** Add `session_signups.payment_status` (`unpaid | paid | waived`) plus an admin
toggle and a per-session total. Stripe can come later; the ledger cannot.
**Done when** the admin page shows collected vs expected for a paid session.

---

## P2 — missing product

### BC-18 · P2 · S — Nobody is told when they move off the waitlist
**Problem** There is an email for "you're in" but none for "you're waitlisted",
"you've been promoted" or "the session was cancelled", and no in-app notification.
**Fix** Add Mailjet templates and send on promotion/cancellation, reusing the
outbox from BC-12.
**Done when** promoting a waitlisted member sends exactly one email.

### BC-19 · P2 · S — No attendance view
**Problem** `check_in_to_session` exists and `played` is a status, but the committee
gets no per-session attendance list or no-show history. `last_played_at` only moves
on selection.
**Fix** Add an attendance column/report to the admin session card and a no-show
count per player.
**Done when** the committee can see who actually turned up for a past session.

### BC-20 · P2 · M — No account lifecycle
**Problem** Magic link only: no way to change email, no account deletion, no
"leave the club". `profiles` rows and signups are kept forever.
**Fix** Add Supabase `updateUser` email change and a delete-my-account flow
(anonymise history, keep fairness counts consistent).
**Done when** a member can leave without emailing the dev.

### BC-21 · P2 · S — No audit trail or change history
**Problem** Admin changes (committee status, templates, cancellation, schedule
regeneration) leave no record, and members see a timetable silently change with no
"what changed" note.
**Fix** Add an `audit_log(actor, action, entity, before, after)` table written by the
admin RPCs, and show the last change on the session card.
**Done when** "who cancelled Wednesday?" is answerable in the UI.

### BC-22 · P2 · S — Friend picker has surprising side effects
**Problem** Choosing a friend for one session also permanently adds them to your
club friend list (`src/features/sessions/components/SessionFriendPicker.tsx`), friends
who are not signed up are selectable and then silently ignored, and the selected
chips lack `aria-pressed`.
**Fix** Separate "add to my friends" from "request this session", disable
non-signed-up friends with an explanation, and finish the a11y states.
**Done when** selecting a friend for one session changes nothing global.

---

## Tech debt

### BC-23 · P2 · L — One schedule pipeline, not four
**Problem** The friend-map merge is re-implemented in
`src/features/sessions/api/dashboard.ts`, `src/features/admin/data.ts` and
`src/features/sessions/api/booking-confirmation-email.ts`; each does its own
roster/preference loading and its own allocation call.
**Fix** One `buildSessionSchedule(sessionId)` service that loads inputs once,
allocates once and persists; every surface reads it (depends on BC-02).
**Done when** `grep -rn "allocateCourtSchedule" src` shows exactly the service and
the tests.

### BC-24 · P2 · S — Statuses are strings, not types
**Problem** `SessionSignupState.currentUserStatus: string | null`, then
`status.includes("waitlist")` (`src/features/sessions/components/SessionSignupStatus.tsx:1-60`),
`SignupOverride` with `string | null`, and `database.types.ts` types
`player_level` as `string`. Every new status silently renders the wrong badge.
**Fix** Generate/declare one union per enum, map at the DB boundary, and exhaustively
switch.
**Done when** adding a status fails the build until every UI branch handles it.

### BC-25 · P2 · M — 57 `console.*` calls and no error page
**Problem** No `src/app/error.tsx`, `not-found.tsx` or `global-error.tsx`; uncaught
server errors fall through to Next's default page. Logs are unstructured (mostly
`errorType` only), with no request id and no alerting.
**Fix** Add the three boundaries, a small `logError(scope, error, context)` helper,
and one sink (Sentry/Logtail). Replace `console.*`.
**Done when** a thrown server error renders a branded page and produces one
searchable log line with a request id.

### BC-26 · P2 · S — Duplicated helpers and magic numbers
**Problem** Four different UUID regexes (member actions, admin player/session/template
actions, dev actions), four copies of the `@atu.ie` check, fee/date/duration
formatting inside components (`SessionCard.tsx`, `SessionsHeader.tsx`,
`CourtScheduleTable.tsx`), `4`/`8` players-per-court literals repeated, and
`formatDuration` printing "1.5 hours" for 90 minutes.
**Fix** `src/lib/validation.ts` and `src/lib/format.ts`; one `PLAYERS_PER_COURT`
constant from the domain, not retyped.
**Done when** the regex and formatter definitions exist once.

### BC-27 · P2 · S — Demo code ships in the production bundle
**Problem** `SessionsPage` supports `mode="demo"` but is only ever rendered as
`<SessionsPage />` (`src/app/page.tsx`), so the demo path is unreachable while
`demo-data.ts`, `demo-schedule.ts`, `DemoClock`, `DemoSignupCountsControl` and their
imports stay in the client bundle (`SessionCard.tsx`, `SessionsHeader.tsx`).
**Fix** Delete the demo path or move it to `/dev` only with a dynamic import.
**Done when** `next build` output shows no demo module in the `/` chunks.

### BC-28 · P2 · M — The allocator is a 1,300-line black box
**Problem** `src/features/sessions/court-schedule.ts` is one 1,303-line module with
greedy selection, scoring, validation and an RNG; up to 500 candidates per call
(`:1157`); tuned by a benchmark script rather than a test budget. Only
`court-schedule.test.ts` covers it.
**Fix** Split into `roster → candidate → score → validate` modules, add property
tests (fast-check) for "everyone plays the same number of games ±1" and "no
double-booking", and set a p95 latency budget in CI.
**Done when** the invariants are tested, not just examples.

### BC-29 · P2 · M — Every member request loads everyone's data with the service key
**Problem** `src/features/sessions/api/dashboard.ts:97` uses `createAdminClient()` to
read all `session_friend_preferences`, all `profiles` and every player's
`club_friend_list`, computes the full schedule for everyone, then keeps only the
caller's games. RLS is bypassed and personal data transits every request.
**Fix** Expose a `get_my_session_games()` RPC (or a view) that computes/returns only
the caller's schedule, and use the user-scoped client.
**Done when** the member page load makes no service-role query.

### BC-30 · P2 · M — N+1 queries and thin indexes
**Problem** One `get_session_roster` and one `get_session_friend_preferences` call
per session (`dashboard.ts:282-330`), plus per-admin table writes; only six indexes
exist for the schema (`club_friend_list(friend_user_id)` and
`session_friend_preferences(user_id)` are unindexed).
**Fix** Batch the RPCs (arrays or a join view), add the missing indexes, and measure
with `EXPLAIN` on a seeded 200-member database.
**Done when** the dashboard issues a constant number of queries regardless of session
count.

### BC-31 · P2 · S — Member UI trusts the device clock (and reads the dev clock)
**Problem** `SessionsDashboard` queries `dev_virtual_clock` from the browser on every
mount, and all time-dependent UI is computed from `useBrowserClock()`
(`src/features/sessions/use-browser-clock.ts`). A wrong phone clock shows the wrong
buttons; a writable dev table changes what members see.
**Fix** Server-render the clock/status, pass `now` down as a prop, and correct with a
small client offset. Remove the browser read of `dev_virtual_clock`.
**Done when** the page renders correct open/closed states with JS disabled or the
device clock wrong by a day.

### BC-32 · P2 · S — Server actions throw strings at the browser
**Problem** Actions throw `new Error("Could not join this session: " + error.message)`
(e.g. `src/features/sessions/api/actions.ts:210-215`), leaking Postgres text to users
and forcing every caller to parse messages. One `as any` remains at
`src/features/admin/template-actions.ts:66` because generated types lag the DB.
**Fix** Return a discriminated `{ ok: true } | { ok: false, code, message }`, map
known DB errors to friendly copy, and regenerate `database.types.ts` in CI.
**Done when** no user-visible string contains a Postgres error.

---

## Ops / DX

### BC-33 · P2 · S — No CI
**Problem** No `.github/`, no `typecheck` script, no formatter. `lint` is bare
`eslint`; migrations and `database.types.ts` can drift unnoticed.
**Fix** One workflow: `tsc --noEmit`, `eslint`, `vitest run`, `supabase db reset` +
`supabase test db`, and a generated-types diff check.
**Done when** a red build blocks merge.

### BC-34 · P2 · M — Playwright is installed but there are zero E2E tests
**Problem** Only three vitest files exist (`court-schedule.test.ts`,
`demo-schedule.test.ts`, `repro.test.ts`); no test covers sign-in, signup, cancel,
finalization or `/admin`.
**Fix** Add a seeded E2E happy path (magic link → signup → finalize → timetable) and
one admin path.
**Done when** CI runs them against `supabase start` + `next start`.

### BC-35 · P2 · S — `main` deploys straight to production with no preview
**Problem** No `vercel.json`, no preview environment, no gate; every push to `main`
is live. This is the highest-risk item for a two-person project.
**Fix** Vercel preview deployments per branch, a production branch that is not
`main`, or at minimum a manual promote step; requires Zelig (see below).
**Done when** a broken commit can be seen in a preview URL before members see it.

### BC-36 · P2 · S — Migrations are applied by hand
**Problem** Deploying is `git push` for the app but `npx supabase db push` for the
database, with no record of which migrations ran where. Drift is invisible until
something breaks.
**Fix** Run migrations in CI against a staging project, then promote; add a
`schema_migrations` check to the release checklist.
**Done when** production schema state is reproducible from the repo alone.

### BC-37 · P2 · S — No security headers, no rate limits
**Problem** `next.config.ts` sets no `headers()`/CSP; `/admin` is indexable; magic
link and RPC endpoints have only Supabase defaults.
**Fix** Add CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
`noindex` on `/admin`, and rate-limit sign-in + signup actions (Upstash or Supabase
edge middleware).
**Done when** securityheaders.com scores A and repeated sign-in attempts are capped.

### BC-38 · P2 · S — No monitoring; the proxy 500s when Supabase blips
**Problem** `src/proxy.ts` throws when `getClaims()` cannot reach Supabase
(`Could not refresh your sign-in…`), turning a transient network error into a full
site outage. There is no uptime check or error alert.
**Fix** Fail open to the sign-in page for auth-refresh failures, keep the redirect
loop guard, and add an uptime monitor plus error alerting.
**Done when** stopping Supabase gives a friendly sign-in page, not a 500.

---

## Suggested first five

1. **BC-01** — the clock backdoor is a one-afternoon security fix.
2. **BC-02 + BC-09** — kills the "different timetable" class of bug for good.
3. **BC-04** — the waitlist is currently a dead end.
4. **BC-35** — stop shipping untested commits to members.
5. **BC-14** — either implement level matching or delete the claim; right now the
   only visible effect of the three levels is the Professional toggle.
