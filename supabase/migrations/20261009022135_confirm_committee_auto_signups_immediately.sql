create or replace function private.auto_signup_committee_members(
  p_session_id uuid default null,
  p_allow_closed_signup_window boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_session record;
  v_member record;
  v_slot_number smallint;
  v_signup_status text;
begin
  for v_session in
    select session.id, session.capacity
    from public.sessions as session
    where session.status = 'open'
      and ((session.event_date + session.starts_at) at time zone 'Europe/London') > now()
      and (
        p_allow_closed_signup_window
        or now() >= session.signup_opens_at
      )
      and (p_allow_closed_signup_window or now() < session.confirmation_at)
      and (p_session_id is null or session.id = p_session_id)
    order by session.confirmation_at, session.id
    for update
  loop
    for v_member in
      select profile.id
      from public.profiles as profile
      join auth.users as club_user on club_user.id = profile.id
      where profile.is_committee
        and profile.committee_auto_signup
        and private.is_club_email(club_user.email)
        and (
          not exists (
            select 1
            from public.session_signups as existing_signup
            where existing_signup.session_id = v_session.id
              and existing_signup.user_id = profile.id
          )
          or exists (
            select 1
            from public.session_signups as existing_signup
            join private.committee_auto_signups as automatic_signup
              on automatic_signup.session_id = existing_signup.session_id
             and automatic_signup.user_id = existing_signup.user_id
            where existing_signup.session_id = v_session.id
              and existing_signup.user_id = profile.id
              and existing_signup.status = 'requested'
          )
        )
      order by profile.id
    loop
      select available_slot.slot_number::smallint into v_slot_number
      from generate_series(1, (v_session.capacity + 3) / 4)
        as available_slot(slot_number)
      where (
        select count(*)
        from public.session_signups as signup
        where signup.session_id = v_session.id
          and signup.slot_number = available_slot.slot_number
          and signup.status in ('selected', 'played')
      ) < 4
      order by available_slot.slot_number
      limit 1;

      v_signup_status := case
        when v_slot_number is null then 'waitlisted'
        else 'selected'
      end;

      update public.session_signups as signup
      set status = v_signup_status,
          slot_number = v_slot_number
      where signup.session_id = v_session.id
        and signup.user_id = v_member.id
        and signup.status = 'requested'
        and exists (
          select 1
          from private.committee_auto_signups as automatic_signup
          where automatic_signup.session_id = signup.session_id
            and automatic_signup.user_id = signup.user_id
        );

      if not found then
        insert into public.session_signups (
          session_id,
          user_id,
          status,
          slot_number
        )
        values (
          v_session.id,
          v_member.id,
          v_signup_status,
          v_slot_number
        )
        on conflict (session_id, user_id) do nothing;

        if found then
          insert into private.committee_auto_signups (session_id, user_id)
          values (v_session.id, v_member.id)
          on conflict do nothing;
        end if;
      end if;

      v_slot_number := null;
    end loop;
  end loop;
end;
$$;

revoke all on function private.auto_signup_committee_members(uuid, boolean)
  from public, anon, authenticated;

create or replace function private.cancel_auto_signups_on_committee_removal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.is_committee and not new.is_committee then
    update public.session_signups as signup
    set status = 'cancelled', slot_number = null
    from private.committee_auto_signups as automatic_signup,
      public.sessions as session
    where automatic_signup.session_id = signup.session_id
      and automatic_signup.user_id = signup.user_id
      and signup.user_id = new.id
      and signup.status in ('requested', 'selected', 'waitlisted')
      and session.id = signup.session_id
      and session.status = 'open';
  end if;

  return new;
end;
$$;

select private.auto_signup_committee_members(null, true);