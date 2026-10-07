# Rally Club

A weekly badminton signup board for Monday and Wednesday evening sessions.
Members request a place from Thursday. At midnight the day before each session,
the club confirms players in order of who has gone longest without playing; members
who have never checked in are first. Selected players are grouped into
four-player court slots across the session. Monday has 2 courts and 16 places;
Wednesday has 4 courts and 32 places. Membership and sign-in are limited to
`@atu.ie` email addresses.

## Local setup

Requirements: Node.js 20 or later and Docker Desktop (or another Docker-compatible runtime).

```bash
npm install
npm run db:start
npm run db:reset
```

Copy `.env.example` to `.env.local` to use the hosted club project. For a local
Supabase instance, replace the public URL and publishable key with the values
printed by `npx supabase status`. Set its service-role key for
`SUPABASE_SERVICE_ROLE_KEY` and keep it server-side. This checkout's ignored
development and production-local environment files also target the hosted project.

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
- Monday sessions run from 18:00 to 19:00 (6–7 pm); Wednesday sessions run
  from 20:00 to 22:00 (8–10 pm).
- The schedule shows the current Monday and Wednesday sessions through
  Wednesday, then switches to the following week's sessions on Thursday.
- Signup requests open Thursday at 00:00 and close at 00:00 the day before the
  event (Europe/London time). Both the signup UI and database enforce these
  time windows.
- The browser clock checks session periods every 60 seconds and uses the
  browser's current time. Session dates and deadlines remain anchored to
  Europe/London.
- When a signed-in member's open dashboard reaches a confirmation deadline, it
  asks a server action to finalize due sessions in Supabase. The service-role
  key is used only on the server. If no member has the dashboard open at the
  deadline, finalization runs when a member next opens the app.
- Final selection prioritizes the oldest `last_played_at`, with never-played
  members first and signup time as the tie-breaker. Overflow is waitlisted.
- Monday sessions have 2 courts and a 16-player capacity. Wednesday sessions
  have 4 courts and a 32-player capacity.
- In `/dev`, the Testing controls set total sign-ups for each weekday from 0 to
  64, including over-capacity counts for previewing waitlist states.
- A selected member checks in after the session to update their play history.

Session capacities are fixed by weekday in the database: 16 for Monday and 32
for Wednesday. The four-player allocation groups run from 1–4 on Monday and
1–8 on Wednesday.

## Database and deployment

Database changes are versioned in `supabase/migrations/`. The current migrations
have been applied to the hosted club project. Run
`npm run db:reset` to reapply them locally and `npm run db:test` for the pgTAP
security suite. The local Supabase Auth before-user-created hook and database
trigger reject accounts outside `@atu.ie`. When configuring a hosted Supabase
project, enable the **Before user created** Auth hook and select
`public.hook_restrict_club_email` to enforce the same signup rule there.

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

The service-role key is required by the server-side session finalization action.
Never prefix it with `NEXT_PUBLIC_` or add it to browser code.

Configure a custom SMTP provider in the hosted Supabase project's Auth settings
before expecting magic links to reach club members. Supabase's default sender
is limited to authorized project-team addresses and is rate-limited.
