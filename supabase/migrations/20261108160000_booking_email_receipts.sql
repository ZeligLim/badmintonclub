-- BC-12: finalization re-sent the booking email to every selected member on every
-- run, because nothing recorded that an address had already been written to.
alter table public.session_signups
  add column if not exists confirmation_email_sent_at timestamptz;

comment on column public.session_signups.confirmation_email_sent_at is
  'Set once Mailjet has accepted the booking confirmation email for this signup.';

-- One lookup for a whole run instead of an auth call per recipient.
create or replace function public.get_booking_email_recipients(p_session_ids uuid[])
returns table (session_id uuid, user_id uuid, email text)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select signup.session_id, signup.user_id, account.email::text
  from public.session_signups as signup
  join auth.users as account on account.id = signup.user_id
  where signup.session_id = any(p_session_ids)
    and signup.status = 'selected'
    and signup.confirmation_email_sent_at is null
    and account.email is not null;
$$;

revoke all on function public.get_booking_email_recipients(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_booking_email_recipients(uuid[])
  to service_role;
