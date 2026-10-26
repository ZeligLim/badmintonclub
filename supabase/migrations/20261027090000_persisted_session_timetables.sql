create table if not exists public.session_timetables (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  court_schedule jsonb not null,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default pg_catalog.now()
);

alter table public.session_timetables enable row level security;

create policy "Anyone can read session timetables" on public.session_timetables
  for select to anon, authenticated
  using (true);

create policy "Committee admins generate and update session timetables" on public.session_timetables
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.is_committee_admin
    )
  );

create policy "Committee admins update session timetables" on public.session_timetables
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.is_committee_admin
    )
  )
  with check (
    exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.is_committee_admin
    )
  );

create policy "Committee admins delete session timetables" on public.session_timetables
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.is_committee_admin
    )
  );

grant select on public.session_timetables to anon, authenticated, service_role;
grant insert, update, delete on public.session_timetables to authenticated, service_role;
