-- A template whose sign-ups open at or after they close can never create a
-- session: `ensure_scheduled_sessions()` skipped it silently and the club simply
-- had no evening sessions. Enforce the ordering in the database so the admin form
-- cannot save one either.
--
-- `not valid` leaves any existing row alone (production has the two templates
-- that caused this), but every insert and update is checked from now on.
alter table public.session_templates
  add constraint session_templates_window_check check (
    signup_opens_lead_days > confirmation_lead_days
    or (
      signup_opens_lead_days = confirmation_lead_days
      and signup_opens_at < confirmation_at
    )
  ) not valid;

-- The check constraint keeps the data honest; the trigger gives the admin a
-- sentence they can act on instead of a constraint name.
create or replace function private.validate_session_template_window()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.signup_opens_lead_days < new.confirmation_lead_days
    or (
      new.signup_opens_lead_days = new.confirmation_lead_days
      and new.signup_opens_at >= new.confirmation_at
    ) then
    raise exception using
      errcode = '22023',
      message = 'Sign-ups must open before they close.';
  end if;

  return new;
end;
$$;

create trigger session_templates_window_check
  before insert or update on public.session_templates
  for each row execute function private.validate_session_template_window();
