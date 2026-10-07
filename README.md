# Rally Club

A weekly badminton signup board for Monday and Wednesday evening sessions.
Members request a place from Thursday. At midnight the day before each session,
the club confirms players in order of who has gone longest without playing; members
who have never checked in are first. Selected players are grouped into four
30-minute court slots. Each session has a configurable capacity, defaulting to
16. Membership and sign-in are limited to `@atu.ie` email addresses.

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
`SUPABASE_SERVICE_ROLE_KEY` and generate a separate value for `CRON_SECRET`.
Keep both secrets server-side. This checkout's ignored development and
production-local environment files also target the hosted project.

```bash
npm run dev
```

The app is at [http://localhost:3000](http://localhost:3000). Local Supabase
email capture is disabled. To send sign-in links, configure the app to use a
hosted Supabase project and configure email delivery in that project's Auth
settings.
Without Supabase environment values, the page runs in clearly labeled demo
mode; demo signups stay in browser state and are not shared.

## Session rules

- Session dates and signup deadlines use the `Europe/London` timezone.
- Each week has Monday and Wednesday sessions starting at 18:00, with a
  two-hour duration.
- Signup requests open Thursday at 00:00 and close at 00:00 the day before the
  event (Europe/London time).
- The Vercel cron runs twice daily and calls `/api/cron/confirm-sessions`;
  `CRON_SECRET` and
  `SUPABASE_SERVICE_ROLE_KEY` must be configured in the deployment environment.
- Final selection prioritizes the oldest `last_played_at`, with never-played
  members first and signup time as the tie-breaker. Overflow is waitlisted.
- A selected member checks in after the session to update their play history.

The initial capacity is 16 and the database accepts capacities of 4, 8, 12, or
16. Change the session creation function and its capacity constraint together
if the club needs different values.

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

The service-role key is required only by the server-side cron handler. Never
prefix it with `NEXT_PUBLIC_` or add it to browser code.

Configure a custom SMTP provider in the hosted Supabase project's Auth settings
before expecting magic links to reach club members. Supabase's default sender
is limited to authorized project-team addresses and is rate-limited.
