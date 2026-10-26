# Local testing

How to run the club app against a local Supabase stack, sign in with the test
account, and open the sign-in link from the local mail catcher.

Everything on this page is **local only**. The hosted project
(`mdfuthjucyeaqdcksehp`) is never involved — see [Production safety](#production-safety).

## Test account

| | |
|---|---|
| Email | `testcommittee@atu.ie` |
| Display name | Test Committee |
| Password | none — sign-in is magic-link (OTP) only |
| Committee member | yes (`is_committee`) |
| Committee admin | **yes** (`is_committee_admin`) — full access to `/admin` |
| Committee auto-signup | yes |

The account has club administrator rights so that every admin surface can be
exercised: player access, professional selection, session templates
(`admin_upsert_session_template`, `admin_set_session_template_active`),
publishing scheduled sessions, and the session-happening switch.

It exists only in the local database. Do not create it on the hosted project.

## Local stack

| Service | URL |
|---|---|
| Next.js app | http://localhost:3000 |
| Supabase API (Kong) | http://127.0.0.1:54321 |
| Postgres | `127.0.0.1:54322` (`postgres` / `postgres`) |
| Supabase Studio | http://127.0.0.1:54323 |
| **Mailpit (email catcher)** | **http://127.0.0.1:54324** |
| Edge functions | http://127.0.0.1:54321/functions/v1/`<name>` |

Start everything:

```bash
npm run db:start   # npx supabase start
npm run dev        # next dev
```

`npm run db:start` prints the same list of URLs plus the local API keys.

## Signing in

Sign-in is a magic link: the app calls `supabase.auth.signInWithOtp` with
`emailRedirectTo: window.location.origin`, and the local SMTP catcher
(Mailpit) receives the message instead of a real mailbox. Nothing is sent to
`testcommittee@atu.ie` on the internet.

1. Open http://localhost:3000/sign-in (or click **Sign in** in the header).
2. Enter `testcommittee@atu.ie` and press **Send**. The page confirms "Sent".
3. Open the mail catcher: **http://127.0.0.1:54324**
4. In the Mailpit **Inbox**, open the newest message — subject **"Your sign-in
   link"**, from `admin@email.com`.
5. Click the sign-in button in the message body (or copy the link next to it
   and paste it into the address bar).
6. The link points at `http://127.0.0.1:54321/auth/v1/verify?...`; following it
   redirects to `http://localhost:3000/?code=...`, and `src/proxy.ts` exchanges
   that PKCE code for a session and sets the `sb-127-auth-token` cookie.
7. The dashboard now shows **Test Committee**, and the "Sign in to join" button
   is gone. `/admin` is reachable too.

### Opening the link in Mailpit

- The Mailpit UI lists every captured message; the newest is at the top of the
  Inbox. Older links stop working — each request creates a fresh message and
  the previous code is invalidated.
- The body shows a button plus the raw URL. Either works; the button is the
  usual path.
- **Open the link in the same browser that requested it.** The PKCE code
  verifier lives in a cookie (`sb-127-auth-token-code-verifier`), so the
  exchange fails with a verifier error if the link is opened in a different
  browser, a private window, or a different browser profile.
- The link must point at `localhost:3000`, not `127.0.0.1:3000`. GoTrue
  honours `[auth] site_url` from `supabase/config.toml`; it is set to
  `http://localhost:3000` for exactly this reason.
- If a link comes back pointing at the hosted project, `supabase/config.toml`
  has drifted — check `site_url`, `additional_redirect_urls`, and `AUTH_API_URL`
  in `.env.development.local` and `supabase/functions/.env`.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "We couldn't send a sign-in link" | `NEXT_PUBLIC_SUPABASE_URL` must be the plain origin `http://127.0.0.1:54321` — no path suffix. `src/lib/supabase/env.ts` now rejects a bad URL at startup. |
| No message in Mailpit | `[local_smtp] enabled = true` is required in `supabase/config.toml`; restart the stack after changing it. |
| Link points at the production app | `[auth] site_url` must be `http://localhost:3000`; `AUTH_API_URL` must be `http://127.0.0.1:54321`. |
| "Invalid flow state" / verifier error | The link was opened in a different browser than the one that requested it. |
| "Only @atu.ie email addresses are allowed" | The sign-in form only accepts `@atu.ie` addresses, and the `before_user_created` hook enforces it. |
| Rate limit error | The local GoTrue container starts with a permissive email limit (`GOTRUE_RATE_LIMIT_EMAIL_SENT=360000`); the `email_sent = 2` in `config.toml` is the hosted default and does not apply locally. |

## Admin access

The test account is already an administrator. After a local database reset the
row is gone, so re-grant it (or re-create the account by signing in once — the
`on_auth_user_created` trigger creates the profile automatically, with the
display name taken from the email local part):

```bash
docker exec -i supabase_db_badminton-club psql -U postgres -d postgres -c "
update public.profiles
   set is_committee_admin = true
 where id = (select id from auth.users where email = 'testcommittee@atu.ie');"
```

Check what the account currently has:

```bash
docker exec -i supabase_db_badminton-club psql -U postgres -d postgres -c "
select u.email, p.display_name, p.player_level, p.is_committee,
       p.is_committee_admin, p.committee_auto_signup
  from public.profiles p join auth.users u on u.id = p.id;"
```

The admin pages and RPCs check `profiles.is_committee_admin` for the signed-in
user (`src/features/admin/data.ts`, and the `admin_*` functions in Postgres),
so the flag above is the single thing that grants access. An `@atu.ie` address
is also required.

## Production safety

- `NEXT_PUBLIC_SUPABASE_URL` in `.env.development.local` is the local origin;
  `src/lib/supabase/env.ts` throws if a non-local host is used while
  `NODE_ENV=development`.
- The hosted project's URL and keys live only in `.env.production.local`.
- Only ever use the `--local` variants: `supabase db reset --local`,
  `supabase migration up --local`, `supabase test db --local`. Never
  `supabase db push` against production, and never create the test account on
  the hosted project.
