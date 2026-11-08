-- The seeded Monday and Wednesday templates opened sign-ups at midnight on the
-- day of the session and closed them at midnight the day before, so
-- `ensure_scheduled_sessions()` saw `signup_opens_at >= confirmation_at` and
-- silently skipped those templates. Only Friday ever produced a session on a
-- fresh database. Open sign-ups on the Thursday before the club week instead,
-- which is what the club actually does.
update public.session_templates
set signup_opens_lead_days = 4
where name in ('Monday evening', 'Wednesday evening')
  and signup_opens_lead_days = 0;
