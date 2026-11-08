-- BC-17: `fee_cents` was shown as "Pay on arrival" with nothing recording whether
-- anybody actually paid, so the committee had no list of who owes what.
alter table public.session_signups
  add column if not exists payment_status text not null default 'unpaid';

alter table public.session_signups
  drop constraint if exists session_signups_payment_status_check;

alter table public.session_signups
  add constraint session_signups_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'waived'));

comment on column public.session_signups.payment_status is
  'Cash ledger: unpaid until a committee member marks it paid or waived.';

create or replace function public.admin_set_payment_status(
  p_session_id uuid,
  p_user_id uuid,
  p_payment_status text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_email text;
  v_previous text;
begin
  select email into v_admin_email from auth.users where id = v_admin_id;

  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1 from public.profiles as caller
      where caller.id = v_admin_id and caller.is_committee_admin
    ) then
    raise exception using
      errcode = '42501',
      message = 'Only a club administrator can record a payment.';
  end if;

  if p_payment_status not in ('unpaid', 'paid', 'waived') then
    raise exception using
      errcode = '22023',
      message = 'Choose unpaid, paid or waived.';
  end if;

  select signup.payment_status into v_previous
  from public.session_signups as signup
  where signup.session_id = p_session_id and signup.user_id = p_user_id;

  if v_previous is null then
    raise exception using
      errcode = '22023',
      message = 'That member is not signed up for this session.';
  end if;

  update public.session_signups
  set payment_status = p_payment_status
  where session_id = p_session_id and user_id = p_user_id;

  insert into public.admin_audit_log (actor_id, target_user_id, action, details)
  values (
    v_admin_id,
    p_user_id,
    'set-payment',
    jsonb_build_object(
      'session_id', p_session_id,
      'from', v_previous,
      'to', p_payment_status
    )
  );
end;
$$;

revoke all on function public.admin_set_payment_status(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_payment_status(uuid, uuid, text)
  to authenticated;
