create or replace function public.update_session_friend_preferences(
  p_session_id uuid,
  p_friend_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_session public.sessions%rowtype;
  v_friend_ids uuid[] := coalesce(p_friend_ids, '{}'::uuid[]);
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to update your friend choices.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie club members can update friend choices.';
  end if;
  if cardinality(v_friend_ids) > 3 then
    raise exception using errcode = '22023', message = 'Select no more than three friends.';
  end if;
  if exists (
    select 1
    from unnest(v_friend_ids) as requested(friend_user_id)
    left join auth.users as friend_user
      on friend_user.id = requested.friend_user_id
    left join public.profiles as friend_profile
      on friend_profile.id = friend_user.id
    where requested.friend_user_id = v_user_id
      or friend_user.id is null
      or friend_profile.id is null
      or not private.is_club_email(friend_user.email)
  ) then
    raise exception using errcode = '22023', message = 'Select existing ATU club members only.';
  end if;

  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found or v_session.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'This session is no longer open.';
  end if;
  if now() < v_session.signup_opens_at then
    raise exception using errcode = 'P0001', message = 'Sign-ups have not opened yet.';
  end if;
  if now() >= v_session.confirmation_at then
    raise exception using errcode = 'P0001', message = 'Sign-ups have closed for this session.';
  end if;
  if not exists (
    select 1 from public.session_signups
    where session_id = p_session_id
      and user_id = v_user_id
      and status in ('requested', 'selected', 'waitlisted')
  ) then
    raise exception using errcode = 'P0001', message = 'You need an active session signup to update friend choices.';
  end if;

  delete from public.session_friend_preferences
  where session_id = p_session_id
    and user_id = v_user_id;

  insert into public.session_friend_preferences (
    session_id,
    user_id,
    friend_user_id
  )
  select p_session_id, v_user_id, selected_friend.friend_user_id
  from (
    select distinct friend_user_id
    from unnest(v_friend_ids) as requested(friend_user_id)
  ) as selected_friend;
end;
$$;
