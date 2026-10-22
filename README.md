# Rally Club

A weekly badminton signup board. The club's recurring sessions are described by
session templates, so the committee can add, change or pause a weekly session
without editing the database by hand. Members request a place from the sign-up
window the template defines. At the closing deadline the club confirms players
in order of who has gone longest without playing; members who have never checked
in are first. Selected players are grouped into four-player court slots across
the session. Membership and sign-in are limited to `@atu.ie` email addresses.

## Local setup

Requirements: Node.js 20 or later and Docker Desktop (or another Docker-compatible runtime).

```bash
npm install
npm run db:start
npm run db:reset
```

Copy `.env.example` to `.env.local` to use the hosted club project. For a local
Supabase instance, replace the public URL and publishable key with the values
printed by `npx supabase status`. This checkout's ignored development and
production-local environment files also target the hosted project.

```bash
npm run dev
```

The live app is at [http://localhost:3000](http://localhost:3000) and requires
Supabase environment values. Use [http://localhost:3000/dev](http://localhost:3000/dev)
for local demo data; demo signups and the adjustable Europe/London demo clock
stay in browser state. The demo route is available only in development.
Local Supabase email capture is disabled. To send sign-in links, configure the
app to use a hosted Supabase project and configure email delivery in that
project's Auth settings.

## Session rules

- Session dates and signup deadlines use the `Europe/London` timezone.
- The club's recurring sessions come from session templates rather than a
  hardcoded weekday list. A template sets the weekday, start time, length,
  capacity, fee, how places are allocated and when sign-ups open and close.
- The templates the club ships with are:
  - Monday evening — 18:00 for 1 hour, 16 places, free, allocated by the
    fairness draw. Sign-ups open 4 days before at 00:00 and close 1 day before
    at 00:00.
  - Wednesday evening — 19:30 for 2 hours, 40 places, free, allocated by the
    fairness draw. Sign-ups open 6 days before at 00:00 and close 1 day before
    at 00:00.
  - Friday afternoon — 15:00 for 3 hours, 16 places, €3 per player, allocated
    first come, first served, and without the committee automatic sign-up.
    Sign-ups open 6 days before at 00:00 and close on the day at 14:30.
- The schedule shows the current club week through Wednesday, then switches to
  the following week's sessions when the next sign-up window opens, which the
  templates decide.
- Both the signup UI and database enforce the sign-up windows.
- Members can cancel their own signup, including a confirmed place, until the
  session starts.
- The browser clock checks session periods every 60 seconds and uses the
  browser's current time. Session dates and deadlines remain anchored to
  Europe/London.
- When a signed-in member's open dashboard reaches a confirmation deadline, it
  asks an authenticated Supabase function to finalize due sessions. The
  database verifies the caller is an `@atu.ie` account and finalizes only
  sessions whose deadlines have passed. If no member has the dashboard open at
  the deadline, finalization runs when a member next opens the app.
- Final selection prioritizes the oldest `last_played_at`, with never-played
  members first and signup time as the tie-breaker. Committee members are
  considered first, then friend groups are ranked using the most recently
  played eligible group member. Awarding a place updates play history to that
  session's scheduled start; overflow is waitlisted.
- First-come-first-served sessions skip the draw: their places are handed out
  in signup order, and a member who signs up for one is given a court straight
  away instead of waiting for the deadline.
- Beginner and Intermediate are member-selectable matching preferences.
  Professional is invite-only and can only be assigned by a club administrator.
  Levels never prevent a player from being selected; complete courts prefer
  compatible levels after fairness and friend-group preferences.
- Members can select up to three club friends for an open-session request.
  Friend selection does not bypass committee priority or longest-since-last-play
  fairness. Friends who do not make an eligible request for that session are
  ignored when matching.
- Each session holds as many players as its template says, in multiples of four
  so the four-player court slots divide evenly.
- In `/dev`, the Testing controls set total sign-ups for each weekday from 0 to
  64, including over-capacity counts for previewing waitlist states.
- A selected member can check in after the session to record attendance.

## Session templates

The club's recurring sessions are described by rows in
`public.session_templates`. A template holds:

- a name and the ISO weekday it runs on (1 = Monday);
- the start time and the length in minutes (30–360);
- the capacity in players (4–64, in multiples of four);
- the fee per player in cents;
- how places are allocated: `lottery` for the fairness draw, `fcfs` for first
  come, first served;
- whether committee members are signed up automatically;
- the sign-up window, given as a number of days before the session and a time
  of day for opening and closing;
- whether the template is active, and the optional dates it runs from and
  until.

Sessions are materialised from the templates by
`public.ensure_scheduled_sessions()`, which the dashboard calls so that the
current and next club week are always covered. Every session stores a copy of
the template values it was created from, together with a reference to its
template. That means:

- editing a template only affects the sessions created after the edit;
- a session whose sign-ups have already opened, or that already has bookings,
  is never changed by a template edit;
- pausing a template removes the sessions that have not been published yet and
  leaves published sessions and their bookings alone.

`/admin` has a **Recurring session templates** panel, where a club
administrator can add, edit and pause templates and press **Publish sessions**
to bring the unpublished sessions in line with the templates. The panel reports
how many sessions were created, updated and removed. The database checks every
change and only lets club administrators manage templates.

## Database and deployment

Database changes are versioned in `supabase/migrations/`. Run
`npm run db:reset` to reapply them locally and `npm run db:test` for the pgTAP
security suite. Push pending migrations to the linked hosted project with
`npx supabase db push`. The local Supabase Auth before-user-created hook and
database trigger reject accounts outside `@atu.ie`. When configuring a hosted
Supabase project, enable the **Before user created** Auth hook and select
`public.hook_restrict_club_email` to enforce the same signup rule there.

After applying the matching migration, a trusted database administrator must
bootstrap the first club administrator by setting `is_committee_admin = true`
for that member's profile, after confirming the member's `@atu.ie` identity.
For example, replace the placeholder with the verified member's Auth user ID:

```sql
update public.profiles
set is_committee_admin = true
where id = '<verified-atu-user-id>'
  and exists (
    select 1
    from auth.users
    where auth.users.id = profiles.id
      and lower(auth.users.email) like '%@atu.ie'
  );
```

Subsequent administrators can manage player levels, committee status and the
recurring session templates in `/admin`; the database verifies administrator
access on every request.

For a hosted setup, create a Supabase project and a Vercel project, copy the
values from `.env.example` into the Vercel environment settings, then link and
deploy with the Supabase and Vercel CLIs:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
vercel login
vercel link
vercel deploy
```

Configure a custom SMTP provider in the hosted Supabase project's Auth settings
before expecting magic links to reach club members. Supabase's default sender
is limited to authorized project-team addresses and is rate-limited.
