# Engineering backlog

Not a "technical debt" file: about half of this is broken behaviour and half is
missing product, so the name is deliberately broader. One ticket per heading,
stable IDs, **P0** = before the next club night, **P1** = this month, **P2** =
opportunistic. Sizes are rough (`S` ≈ an evening, `M` ≈ a weekend, `L` ≈ a week).
Every ticket is scoped to fit one PR and names its evidence in this repo.

Ticket IDs are never reused, so a gap means the ticket shipped. Closed by
`fa83bb2` *"Fix timetable drift and freeze published schedules"* (2026-11-05):
**BC-02** (one saved timetable for every viewer), **BC-06** (the allocator now
throws on an invalid schedule instead of returning it) and **BC-14** (level
matching is implemented in the allocator). Whatever survived those three has been
folded into the tickets below, mostly BC-09, BC-23 and BC-39.

Closed by `71e7c3c` *"ci: gate production builds on typecheck, lint and tests"*
(2026-11-05): **BC-33** (CI now exists and `npm run build` refuses to deploy a red
tree). What BC-33 could not deliver — required checks on `main` — moved to BC-42.

Closed by `bb6baca` *"chore: regenerate database types and block drift"*
(2026-11-05): **BC-41** (the committed generated types now match a fresh
`supabase gen types`, and the drift step fails the job instead of warning). Docker
became available locally during the check, which showed the drift step had been
failing all along behind `continue-on-error`.

Closed by `experimental/fix-all-tech-debt` (2026-11-05, nine commits from
`388b783` to `54315ba`): **BC-23** (all three writers call
`src/features/sessions/api/timetable.ts`), **BC-24** (one union per status, parsed
at the database boundary in `src/features/sessions/status.ts`), **BC-25** (every
log line goes through `src/lib/log.ts`; `error.tsx`, `global-error.tsx` and
`not-found.tsx` exist), **BC-26** (`src/lib/format.ts` and `src/lib/validation.ts`
replaced the copies and the magic `4`/`8` literals), **BC-27** (no demo module
reaches the production bundle), **BC-29** (the member page uses the user-scoped
client and two bulk RPCs), **BC-30** (one round trip, plus
`session_friend_preferences(session_id, user_id)` and `club_friend_list(friend_user_id, user_id)`
indexes), **BC-31** (`serverNow` comes from the server and
`useServerClock` ticks from it), **BC-32** (actions log the database error and
throw a clean message).

Closed by `experimental/p1-corrections` (2026-11-08): **BC-13** (README claims
match the code; `.env.example` exists), **BC-11** (unknown database values are
logged and fall back instead of 500ing the dashboard), **BC-08** (`anon` can no
longer read `session_timetables`), **BC-09** (a friend-list change deletes the
saved timetable while it is still private), **BC-10** (`/admin` renders without
writing; saving is an explicit action), **BC-40** (playing level is the tie-break
inside a fairness bucket, by `82e0dee`), **BC-44** (no migration creates
sessions: `db reset` leaves `public.sessions` empty) and **BC-42**/**BC-43**
remain open because they need repository-admin rights.

Closed by `96d792a` *"fix: redirect anonymous visitors before the admin page
streams"* (2026-11-08): **BC-45** (`src/proxy.ts` now answers `307` to
`/sign-in` for an unknown visitor before the admin page starts streaming, so no
admin chrome reaches a stranger; signed-in administrators still get `200`).

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

### BC-03 · P0 · S — "Regenerate" deletes the old timetable before making a new one
**Problem** `regenerateSessionCourtSchedule` deletes the row
(`src/features/admin/session-actions.ts:45`), then calls
`loadAdminData({ allocationSeed: randomUUID() })`, which refreshes **every**
unlocked, unconfirmed session whose persisted schedule is missing or stale — not
just the target. If the target comes back empty it throws — after the delete. A
failure leaves the session with no timetable and unrelated sessions rewritten.
`fa83bb2` added a release-lock check before the delete, so a published timetable
can no longer be destroyed this way, but the delete-then-generate ordering at
`:45-52` is unchanged.
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
**Problem** `src/features/sessions/api/actions.ts:272` awaits
`invalidateSessionTimetable()` **after** the RPC has committed, and that helper
still throws `Could not refresh this session's court matching.` (`:82`) when the
delete fails. The user then sees an error while their place is already cancelled,
so they retry and get "No open signup request was found". `fa83bb2` made the
helper return early once the timetable is published and log (instead of throw)
when the session lookup fails, but the delete-error path is still fatal, and
`joinConfirmedSession` (`:216`) has the same shape.
**Fix** Cache invalidation is best-effort: log it, never throw. Same for
`updateSessionFriendPreferences`.
**Done when** a failing invalidation still returns success to the client and the
signup row reflects the cancellation.

---

## P1 — correctness and features people already believe exist

### BC-07 · P1 · S — Confirmation only happens if someone has the dashboard open
**Problem** Finalization is a client effect
(`src/features/sessions/components/SessionsDashboard.tsx:175-213`) gated on the
browser clock. No member online at the deadline means no confirmation, no timetable
and no email until the next visit; a wrong device clock runs it early or late.
**Fix** Shipped in `f6126cc`: `public.finalize_due_sessions_service()` lets the
service role run `private.finalize_due_sessions()` without a user session
(`20261108150000_service_finalize_sessions.sql`), and `/api/cron/finalize` calls it
behind a `CRON_SECRET` bearer check, with `vercel.json` scheduling one run a day.
The dashboard's client call stays as the fallback for the deadlines between runs.
`supabase/tests/service_finalize.test.sql` proves a due session confirms with no
browser attached.
**Done when** a session is confirmed without any browser being open.
**Caveats** Hobby plans only run a cron once a day, so a first-come-first-served
session that closes at 14:30 still depends on somebody opening the app (or on
pg_cron, the upgrade path); and `CRON_SECRET` has to be set in Vercel before the
route does anything but return 401.

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
(`src/features/sessions/api/actions.ts:126-152`) never invalidate
`session_timetables`, and there is no DB trigger. Changing your friend list silently
leaves every persisted schedule stale.
`fa83bb2` made this worse in one specific case: `shouldRefreshPersistedCourtSchedule`
(`src/features/sessions/court-schedule.ts:130`) now returns `false` for any
**confirmed** session, so after the confirmation draw the admin page will not rebuild
a timetable even while it is still private. Between `confirmation_at` and the
30-minute release (up to 17.5 hours for a lottery) late joins invalidate via
`actions.ts:216`, but friend-list and friend-preference changes only invalidate
through `updateSessionFriendPreferences` — and `addClubFriend` / `removeClubFriend`
do not. The only remaining safety net is the confirmation trigger, which runs once.
**Fix** Invalidate on those RPCs, or better, add a trigger on `club_friend_list` and
`session_friend_preferences` that bumps a `schedule_revision` on affected sessions,
and let the admin/read path refresh a confirmed-but-unreleased timetable.
**Done when** adding a friend to a confirmed, unreleased session changes the next
read's timetable, and a released one is rejected loudly instead of silently ignored.

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
(`src/features/sessions/api/booking-confirmation-email.ts:135-160`) still loads one
recipient per `admin.auth.admin.getUserById` call and sends one Mailjet request per
recipient (`:103`), and it still emails every `selected` row for every due session on
each run — there is no per-recipient "already emailed" record. Failures log only
`stage` and `errorName`.
`fa83bb2` removed the worst part (the full schedule is now read from
`session_timetables` instead of recomputed per recipient, `:244-262`), so the
per-recipient panel is cheap when a timetable exists, but a confirmed session
without one still re-allocates per recipient and re-persists it per recipient.
**Fix** Shipped in `5058439`: `session_signups.confirmation_email_sent_at` records
the receipt, `public.get_booking_email_recipients(uuid[])` returns only the rows
without one (one auth join instead of a `getUserById` per recipient), the run builds
every email and makes a single `sendMailjetEmails` call, and each accepted address is
stamped. Partial acceptance and per-recipient failures are logged with the session,
user and error message.
**Done when** re-running finalization for an already-confirmed session sends zero
emails and one run for 40 players makes one allocation and one batched send.
**Done** — `supabase/tests/booking_email_recipients.test.sql` covers "only members
without a receipt are returned" and the service-role-only grant; the batching is
what `sendSelectedBookingConfirmationEmails` now does, one `sendMailjetEmails` call
per run.

### BC-13 · P1 · S — README promises behaviour the code does not have
**Problem** Two claims in `README.md` are still false. It says members can cancel
"until the session starts" (`README.md:58`) while the UI cuts off 30 minutes before
(`src/features/sessions/components/SessionsDashboard.tsx:527`) and
`cancel_session_signup` does the same in SQL. It also tells you to copy
`.env.example` (`README.md:21`, `:162`) — the file does not exist. Separately,
`README.md:34` says local email capture is disabled while `docs/local-test.md`
documents Mailpit as the way to sign in.
`fa83bb2` fixed the third claim it used to make: complete courts now really do
prefer compatible levels (`README.md:76-83`), and the timetable-freeze rule is now
documented.
**Fix** Correct the three claims and add `.env.example` (names only, no values).
**Done when** a fresh clone can follow the README end to end without guessing.

### BC-15 · P1 · S — There is no way to make someone a committee admin
**Problem** `/admin` can toggle committee and Professional access
(`src/features/admin/player-actions.ts`), but `is_committee_admin` can only be set by
the hand-written SQL in the README. Adding a second admin, or replacing one who
leaves, currently needs database access.
**Fix** Shipped in `ec435bf`: `admin_set_committee_admin(uuid, boolean)` enforces
the caller is an administrator, promotes through `is_committee = true` and refuses to
demote the last one (`There must always be at least one committee administrator.`).
Every change lands in `public.admin_audit_log`, shown as "Recent administrator
changes" under the access table. `/admin` gained an Admin column.
**Done when** two admins can be managed from `/admin` and the last one cannot be
removed.
**Done** — `supabase/tests/committee_admin_management.test.sql` (7 assertions) covers
the member-cannot-self-promote case, promoting a second admin, demoting one of two,
refusing the last, and two audit rows.

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
**Fix** Shipped in `64fb4db`: `session_signups.payment_status`
(`unpaid | paid | waived`) with a check constraint, `admin_set_payment_status`
(administrator only, audited with the previous and new state), a Payment column on
each confirmed roster row, and a per-session "collected of expected · N outstanding"
line. Stripe can come later; the ledger exists now.
**Done when** the admin page shows collected vs expected for a paid session.
**Done** — `supabase/tests/session_payments.test.sql` (6 assertions) covers the
unpaid default, a member being refused, the administrator update, an unknown state
being rejected and the audit entry.

### BC-48 · P2 · S — A released timetable from an older allocator is served silently
**Problem** The member dashboard served any shape-valid persisted row
(`src/features/sessions/api/dashboard.ts`), so a schedule built by an older
`COURT_ALLOCATION_VERSION` looked current — and once locked it could not be
refreshed.
**Fix** Shipped with `cdd0026`: the dashboard compares the saved row with
`isCurrentPersistedCourtSchedule`, and when the session is already locked it sets
`ClubSession.timetableOutdated`; `SessionCard` shows an amber note pointing the
community at the admin repair tool.
**Done when** an outdated released timetable is visible as outdated instead of
being presented as current.

### BC-49 · P1 · M — Cancelling stops 30 minutes before the session, so late drops are invisible
**Problem** `cancel_session_signup` refused any cancellation from start−30 minutes
(`20261015093209_close_cancellations_at_confirmation_time.sql`), and nothing
recorded that a player had dropped out after the timetable was released. The
other three players on that court turned up to an empty seat, and the committee
had no record of who failed to show.
**Fix** Shipped in `5250a09` (branch `feat/late-cancel-and-timetable-ux`, not merged):
`20261108210000_late_cancellation_and_no_shows.sql` moves the cancellation cutoff
to the first serve and adds `session_signups.no_show_at` plus
`public.set_session_no_show(session_id, no_show)` — start-only, selected/played-only.
The timetable is not re-drawn after the start: a no-show keeps their place and is
shown struck through in everyone's timetable. A cancellation before the start
rebuilds the published timetable through `save_session_timetable`.
**Done when** cancelling works until the first serve, and after the start a player
can mark themselves as not coming without moving anyone else's games.
**Done** — `supabase/tests/late_cancellation.test.sql` (13 assertions); mobile
run-through at 390×844 with screenshots in `artifacts/`.

### BC-50 · P1 · M — A re-drawn timetable is never announced to the players it moved
**Problem** Invalidating or rebuilding a published timetable changed the JSON with
no version, no record of what each member had seen, and no notice — a member who
checked their courts in the morning would arrive to a different schedule.
**Fix** Shipped in `5250a09`: `session_timetables.version`
bumped by the single writer `public.save_session_timetable(...)`,
`session_signups.timetable_seen_version`, `public.mark_session_timetable_seen(...)`,
and `TimetableChangeNotice` — a `role="alertdialog"` shown on dashboard load when
a session's saved version is newer than the version that member acknowledged.
`timetableChanged` is only true once a member has seen a version before, so the
first view never nags.
**Done when** after a re-draw, affected members are told once and the notice never
reappears until the next change.
**Done** — covered by `supabase/tests/late_cancellation.test.sql` (save returns 1
then 2; seen copies 2) and verified in the browser.


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

### BC-51 · P2 · S — There is no dark mode
**Problem** The app only had a light palette, and plenty of components hardcoded
`bg-white`, so a `dark` class on `<html>` produced white cards with light text.
**Fix** Shipped in `5250a09`: `ThemeToggle` (a `switch` inside the
header's overflow menu) writes `localStorage.theme`, an inline script in
`src/app/layout.tsx` applies it before paint, and every `bg-white` became the
`bg-card` token so the existing `.dark` variables in `src/app/globals.css` apply.
**Done when** a member can switch themes from the menu and the choice survives a
reload.

### BC-52 · P2 · M — An ongoing session lists every 15-minute game
**Problem** The card listed all of a member's games in a flat list, did not include
their own name in their court line, and gave no way to see the whole session's
schedule — so during play the page was long, repetitive and hard to read on a
phone.
**Fix** Shipped in `5250a09`: an in-progress session shows only
the current and next games (current one highlighted), prints the member's own name
first, offers "Show all N of your games", and a "See everyone's timetable" dialog
with every court and round, read-only, with no-shows struck through.
**Done when** a member on court can see what is happening now and next in one
screen, and can open the full grid in one tap.


---

## Tech debt

### BC-28 · P2 · M — The allocation search is still one module
**Problem** The level rules now live in `src/features/sessions/court-schedule.levels.ts`,
but candidate generation, greedy selection, doubles optimisation, scoring and
validation are still ~1,400 lines in `src/features/sessions/court-schedule.ts`, and
the 500-candidate branch (`:1329`) is only exercised by the benchmark.
**Fix** Shipped in `3b88647`: the pipeline is now `court-schedule.shared.ts`
(types, constants, RNG and small comparisons), `court-schedule.select.ts` (anchors,
friend packs, court groups, doubles pairing), `court-schedule.candidates.ts`
(round-by-round greedy build), `court-schedule.score.ts` (the lexicographic score
vector), `court-schedule.validate.ts` (court sizes and the finished-timetable
check) and `court-schedule.levels.ts`. `court-schedule.ts` is 262 lines and only
keeps the persistence helpers plus the public entry points.
**Done when** each step is a module with its own tests, not just examples.
**Done** — `court-schedule.validate.test.ts` covers court sizes, round
double-booking, roster membership, duplicate players and score ranking, and
`court-schedule.properties.test.ts` holds a p95 latency budget over ten seeded
runs of a 40-player, four-court evening.

---

### BC-46 · P2 · S — Test fixtures derive their dates from the wall clock
**Problem** `supabase/tests/session_templates.test.sql` used the next club week
(`date_trunc('week', now()) + 8`) for a session that "has not been published yet".
The template's four-day lead time put its `signup_opens_at` at midnight of the day
the suite ran, so the test passed before midnight and failed after it — the same
class of bug as BC-44, hidden until CI ran the suite at 00:05.
**Fix** The scenario pins `signup_opens_at` itself, and
`scripts/check-session-fixtures.mjs` (run by `npm run verify`) fails when a session
fixture derives a date from `now()` without setting its own sign-up window.
Freezing `dev_virtual_clock` for the suite was considered and rejected: nothing in
the schema calls `public.now()` outside its own migration, so a pinned clock would
have changed no behaviour while coupling the tests to a table that BC-01 wants
deleted.
**Done when** the full suite passes at any hour, including the 00:00 and week
boundaries.
**Done** — the failing scenario was reproduced after midnight, the fixture now
pins its own window, and `npm run check:tests` (inside `verify` and `build`)
refuses any session fixture that takes a date from `now()` without pinning
`signup_opens_at` and `confirmation_at`. The suite has since passed on CI at
00:05 and locally in the evening.

---

## Ops / DX

### BC-34 · P2 · M — Playwright is installed but there are zero E2E tests
**Problem** Nine vitest files cover the allocator and `session-timing`, but no test
covers sign-in, signup, cancel, finalization or `/admin`, and the timetable-freeze
invariants are covered only by unit tests of the pure allocator and its TypeScript
callers, never by the DB triggers that actually enforce them
(`20261105120000_freeze_published_timetables.sql`).
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

### BC-39 · P1 · M — A wrong published timetable is now permanent
**Problem** `fa83bb2` makes the saved timetable authoritative and immutable, but
gives nobody a way to repair it. `shouldRefreshPersistedCourtSchedule`
(`src/features/sessions/court-schedule.ts:130`) returns `false` once a session is
locked **or confirmed**, the member dashboard serves any shape-valid row regardless
of `allocationVersion` (`src/features/sessions/api/dashboard.ts:202`), the admin
page hides the regenerate button when locked (`CourtScheduleTable.tsx:51`),
`regenerateSessionCourtSchedule` throws past the release (`session-actions.ts:34`),
and the DB trigger rejects authenticated updates and deletes for good measure. So a
timetable saved from a stale preview — which happens whenever the backfill in
`20261105120000_freeze_published_timetables.sql` runs after a session's release
time, since that delete is itself gated on `now() < … - interval '30 minutes'` —
can never be corrected from the app once the session is locked, only with
service-role SQL.
**Fix** Shipped in `cdd0026`: the freeze trigger honours a transaction-local
`badminton.allow_locked_timetable_write` flag that only `admin_swap_session_player`
sets, so a released timetable can be edited from `/admin` (pick out, pick in, why),
`generated_by` records the administrator and `admin_audit_log` records `was_locked`
plus the reason. Ordinary clients are still frozen.
**Done when** a committee admin can rebuild a released timetable from the final
roster without SQL, and the change is attributable.
**Remaining** the read-side check that flags a saved row whose `allocationVersion`
is older than `COURT_ALLOCATION_VERSION` — shipped as **BC-48** below.

### BC-40 · P1 · S — The selection draw ignores playing level
**Problem** `fa83bb2` implemented level compatibility inside the allocator, but the
fairness draw that decides *who gets in* still orders by
`is_committee desc, effective_last_played_at asc nulls first, signed_up_at asc,
user_id asc` (`supabase/migrations/20261021180000_optimize_court_slot_allocation.sql:293-300`).
Zelig's stated rule — "pair committee first, the rest rank by the level of playing"
— is therefore half-implemented: level changes who you play *with*, never whether
you get a place.
**Fix** Decide what level should do at selection time (tie-break after freshness,
or a rating band), add it to the draw, and write the rule down in
`docs/court-allocation.md`.
**Done when** a mixed-level roster that is otherwise tied produces a different
selected set, in a pgTAP test.

---

### BC-42 · P2 · S — A red build blocks *deploying*, not *merging*
**Problem** Vercel builds every push to `main`, so `npm run build` → `npm run verify`
stops a red commit from reaching members. But GitHub still merges it: no branch
protection, no required status checks, and the `checks`/`database` jobs are advisory.
Two people pushing at once can also land a broken `main` that later commits sit on
top of.
**Fix** Enable branch protection on `main` (require `checks`, dismiss stale
approvals, no force-push), which needs repo-admin rights, plus `main` as a
protected branch in the Vercel project settings if available on Hobby. Also bump
`actions/checkout@v4` and `actions/setup-node@v4` (the runner forces them onto
Node 24 and emits a deprecation warning on every run).
**Done when** a PR with a failing `checks` job cannot be merged.

### BC-43 · P3 · S — The test gate now sits in the deploy path, untested
**Problem** Adding `verify` to `build` means a flaky or slow test blocks production
for everyone, and the `database` CI job (`supabase start`, `db reset`, pgTAP) had
never executed — it could not run in the agent sandbox (no Docker). Its first real
run proved the point: `checks` went green while `database` went red with six files
aborting on `sessions_event_date_key`. The regressions sweep alone is ≈12s of the
≈13s suite.
**Fix** Run the workflow on a throwaway branch once the suite is stable, confirm
both jobs are green, then decide whether `verify` stays in `build` or moves to a
required check only.
**Done when** a push to a scratch branch shows both jobs green, and the suite is
known-stable on the Node 24 image.

### BC-44 · P1 · S — A migration inserts sessions when it runs
**Problem** `supabase/migrations/20261015232600_friday_fee_and_saturday_open.sql:86`
ends with `select public.ensure_next_week_sessions();`, so every `db reset` — and
any future apply against a fresh database — materialises the current and next club
week relative to *the moment it runs*. Six pgTAP files delete every session at the
top of their transaction to avoid colliding with those phantom rows, and a brand-new
production project would start with sessions nobody scheduled.
**Fix** Drop the call from the migration (the dashboard already calls
`ensure_next_week_sessions()` at runtime) and, if the seeded rows must go from
existing databases, ship a one-off migration that deletes sessions on those two
dates when they have no signups.
**Done when** `supabase db reset` leaves `public.sessions` empty and the pgTAP
suite passes without the per-file deletes.

### BC-47 · P1 · S — Monday and Wednesday sessions stopped being generated
**Problem** While making `db reset` start empty (BC-44) the template path was
exercised on a fresh database for the first time. The seeded Monday and
Wednesday templates had `signup_opens_lead_days = 0`, `signup_opens_at = 00:00`
and `confirmation_lead_days = 1`, `confirmation_at = 00:00`, so
`ensure_scheduled_sessions()` computed sign-up opening *after* confirmation and
hit the silent `continue` at
`supabase/migrations/20261022100100_template_driven_sessions.sql:91`. Only the
Friday template could produce a session. Every Monday/Wednesday row in
production predates the template migration; once the current window is used up,
the dashboard will show no evening sessions and nothing will log a warning.
**Fix** Shipped: `20261108140000_fix_template_signup_windows.sql` opens sign-ups
on the Thursday before the club week (`signup_opens_lead_days = 4`) for the
Monday and Wednesday templates, and
`20261108141000_reject_impossible_template_windows.sql` adds a check constraint
(backstop, `not valid` so existing rows are untouched) plus a before-trigger that
raises `Sign-ups must open before they close.` when an admin saves an impossible
window. `session_templates.test.sql` asserts both the shipped defaults and the
rejection.
**Done when** a template with an impossible window is rejected when saved, and a
fresh database generates every active template's session for two weeks ahead.
**Done** — verified by `npx supabase db reset --local` (empty `sessions`) followed
by `npx supabase test db --local` (13 files, 327 tests, PASS).

### BC-45 · P2 · S — Anonymous `/admin` answers 200 with a shell before redirecting
**Problem** With the local stack running (`npm run dev`, `curl -s -o /dev/null -w '%{http_code}'
localhost:3000/admin`), an unauthenticated request returns **200** and 23 KB of HTML
containing the admin chrome and `Loading club…`; the payload carries `NEXT_REDIRECT`
markers, so the redirect happens after the shell has been flushed. No club data
leaks, but the status code is wrong for bots and broken clients, and any failure
between flush and redirect renders admin chrome to a stranger. The same response
shape was visible on production (`https://badmintonclub.vercel.app/admin`).
**Fix** Gate in `src/proxy.ts` (it already reads claims on every request) or move the
`requireCommitteeAdmin()` check into a layout that resolves before streaming, so the
response is `307`/`403` instead of `200`.
**Done when** an unauthenticated `GET /admin` returns a redirect status and no admin
markup.
**Shipped in** `96d792a`: `src/proxy.ts` returns `307` with `location: /sign-in` and
an empty body for an unauthenticated `/admin` (or `/admin/...`) request, before the
page renders. Verified locally (`curl -s -o /dev/null -D - localhost:3000/admin` →
`HTTP/1.1 307`, `location: /sign-in`; a signed-in administrator still gets `200`)
and in production after the deploy.

---

## Suggested first five

1. **BC-01** — the clock backdoor is a one-afternoon security fix, and it is live
   in production right now.
2. **BC-04** — the waitlist is still a dead end: cancelling never promotes anybody.
3. **BC-36** — migrations only reach production by hand; wire them into CI.
4. **BC-35** — previews are invisible to the committee and would crash without
   preview-scoped environment variables.
5. **BC-42** — a red build stops a deploy but not a merge; turn on branch protection.
